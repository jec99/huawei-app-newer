from flask import Flask, request, session, g, redirect, url_for, Response, \
	abort, render_template, flash, jsonify, send_from_directory
from flask.ext.compress import Compress
from sqlalchemy import create_engine, func
from sqlalchemy.orm import scoped_session, sessionmaker
from sqlalchemy.ext.declarative import declarative_base
from geoalchemy2 import Geometry
from geojson import Feature, FeatureCollection, dumps, loads
from models import Weather, BlockGroup, BikeStation, BikeRide, \
	SubwayStation, SubwayDelay, Location, Base
from numpy import isclose
from datetime import datetime, timedelta
from math import ceil
import json
import re
from subprocess import Popen, PIPE

DEBUG = True
SECRET_KEY = 'develop'
USERNAME = 'admin'
PASSWORD = 'password'

engine = create_engine('postgresql://localhost/dc', convert_unicode=True)
db_session = scoped_session(sessionmaker(
	autocommit=False,
	autoflush=False,
	bind=engine
))

engine_routing = create_engine('postgresql://localhost/osm-dc-routing', convert_unicode=True)
db_session_routing = scoped_session(sessionmaker(
	autocommit=False,
	autoflush=False,
	bind=engine_routing
))


app = Flask(__name__)
# if v. slow on large files
# Compress(app)
app.config.from_object(__name__)


@app.teardown_appcontext
def shutdown_session(exception=None):
	db_session.remove()
	db_session_routing.remove()


@app.route('/')
def main():
	return send_from_directory('static/html', 'index.html')


@app.route('/station_data')
def get_geojson():
	rets = []
	st = db_session.query(BikeStation)
	for s in st:
		geom = json.loads(db_session.scalar(s.geom.ST_AsGeoJSON()))
		feature = Feature(
			id=s.id,
			geometry=geom,
			properties={
				'name': s.name
			}
		)
		rets.append(feature)
	return jsonify(FeatureCollection(rets))


@app.route('/rides/<int:start>/<int:end>')
def get_rides_specific(start, end):
	rets = []
	rds = db_session.query(BikeRide).filter(
		(BikeRide.start_station_id == start) & (BikeRide.end_station_id == end)
	)
	for r in rds:
		feature = {
			'id': r.id,
			'duration': r.duration,
			'subscribed': r.subscribed,
			'start_date': r.start_date.isoformat(),
			'end_date': r.end_date.isoformat()
		}
		rets.append(feature)
	return Response(json.dumps(rets), mimetype='application/json')


def merge_linestrings(ls):
	# takes an ordered list of GeoJSON linestrings forming a path and makes them into
	# one long linestring. maybe the linestring is oriented "backwards"

	# forwards vs backwards for last string

	if len(ls) < 2:
		return ls

	ls_t = lambda n: ls[n]['coordinates']

	def relative_orientation(lns1, lns2):
		if all(isclose(lns1[-1], lns2[0], atol=0.000001, rtol=0)):
			return (1, 1)
		elif all(isclose(lns1[-1], lns2[-1], atol=0.000001, rtol=0)):
			return (1, -1)
		elif all(isclose(lns1[0], lns2[0], atol=0.000001, rtol=0)):
			return (-1, 1)
		elif all(isclose(lns1[0], lns2[-1], atol=0.000001, rtol=0)):
			return (-1, -1)
		else:
			raise Exception('LineStrings are incompatible.')

		# orientation of the first string:
	last_orient = relative_orientation(ls_t(0), ls_t(1))[0]
	points = ls_t(0)[:] if last_orient == 1 else ls_t(0)[::-1]
	for i in range(1, len(ls)):
		last_orient = relative_orientation(points, ls_t(i))[1]
		if last_orient == 1:
			points.extend(ls_t(i)[1:])
		else:
			points.extend(list(reversed(ls_t(i)))[1:])

	return { 'type': 'LineString', 'coordinates': points }


def closest_node(x, y):
	# finds the closest routing node to lng=x, lat=y
	query = "\
		select case when ST_Distance(ST_Point({0}, {1}), ST_Point(x1, y1)) > \
						ST_Distance(ST_Point({0}, {1}), ST_Point(x2, y2)) \
						then target \
					else source \
			   end as node \
		from ways \
		order by ST_Point({0}, {1}) <-> geom_way asc \
		limit 1; \
	".format(x, y)

	return db_session_routing.execute(query).first()[0]


def fastest_route(m, n):
	query = "\
		select ST_AsGeoJson(geom_way) \
		from pgr_dijkstra(' \
			select id, \
				source::integer, \
				target::integer, \
				cost::double precision \
				from ways', \
			{0}, {1}, false, false) \
		a left join ways b \
		on a.id2 = b.id; \
	".format(m, n)
	edges = db_session_routing.execute(query).fetchall()
	edges = [json.loads(e[0]) for e in edges if e[0]]

	return merge_linestrings(edges)


@app.route('/bike_station_route/<int:start>/<int:end>')
def get_route(start, end):
	rets = []

	def station_coords(n):
		return db_session.query(BikeStation.geom.ST_X(), BikeStation.geom.ST_Y()).filter(BikeStation.id == n).first()

	start_node = closest_node(*station_coords(start))
	end_node = closest_node(*station_coords(end))

	return jsonify(fastest_route(start_node, end_node))


@app.route('/bike_rides_interval_events')
def rides_by_start():
	# gets the ride counts for each station in stations between t_start
	# and t_end grouped by t_interval, for subscribed riders or not
	# times need to be formatted like YYYY-MM-DD hh:mm:ss, t_interval is
	# formatted as 0d:0h:0m:0s

	t_start = request.args.get('t_start')
	t_end = request.args.get('t_end')
	t_interval = request.args.get('t_interval')
	stations = request.args.getlist('station')
	subscribed = request.args.getlist('subscribed')

	stations = map(int, stations) if stations else [e[0] for e in db_session.query(BikeStation.id).all()]
	subscribed = map(bool, subscribed) if subscribed else [True, False]
	d, h, m, s = map(int, re.match('(\d*):(\d*):(\d*):(\d*)', t_interval).groups())
	interval_td = timedelta(days=d, hours=h, minutes=m, seconds=s)
	start_dt = datetime.strptime(t_start, '%Y-%m-%d %H:%M:%S')
	end_dt = datetime.strptime(t_end, '%Y-%m-%d %H:%M:%S')
	num_intervals = int(ceil((end_dt - start_dt).total_seconds() / interval_td.total_seconds()))

	query = """
		select start_date, ST_X(geom) as x, ST_Y(geom) as y
		from bike_rides left join bike_stations on bike_rides.start_station_id=bike_stations.id
		where start_date >= '{0}' and end_date < '{1}' and bike_stations.id in {2} and subscribed in {3}
	""".format(t_start, t_end, str(tuple(stations)), str(tuple(subscribed)))
	rds = db_session.execute(query).fetchall()

	ret = { i: [] for i in range(num_intervals)}

	for r in rds:
		interval = int((r[0] - start_dt).total_seconds() / interval_td.total_seconds())
		ret[interval].append({
			'lng': r[1],
			'lat': r[2]
		})

	return jsonify(ret)


@app.route('/bike_rides_interval_counts')
def rides_by_start_counts():
	t_start = request.args.get('t_start')
	t_end = request.args.get('t_end')
	t_interval = request.args.get('t_interval')
	stations = request.args.getlist('station')
	subscribed = request.args.getlist('subscribed')

	stations = map(int, stations) if stations else [e[0] for e in db_session.query(BikeStation.id).all()]
	subscribed = map(bool, subscribed) if subscribed else [True, False]
	d, h, m, s = map(int, re.match('(\d*):(\d*):(\d*):(\d*)', t_interval).groups())
	interval_td = timedelta(days=d, hours=h, minutes=m, seconds=s)
	start_dt = datetime.strptime(t_start, '%Y-%m-%d %H:%M:%S')
	end_dt = datetime.strptime(t_end, '%Y-%m-%d %H:%M:%S')
	num_intervals = int(ceil((end_dt - start_dt).total_seconds() / interval_td.total_seconds()))

	bike_query = """
		select bike_stations.id, start_date
		from bike_rides left join bike_stations on bike_rides.start_station_id=bike_stations.id
		where start_date >= '{0}' and end_date < '{1}' and bike_stations.id in {2} and subscribed in {3}
	""".format(t_start, t_end, str(tuple(stations)), str(tuple(subscribed)))
	rds = db_session.execute(bike_query).fetchall()

	station_data = list(db_session.query(
		BikeStation.id,
		BikeStation.geom.ST_X(),
		BikeStation.geom.ST_Y()
	).filter(BikeStation.id.in_(stations)).all())

	ret = {
		i: {
			id: {
				'lng': lng,
				'lat': lat,
				'count': 0
			} for id, lng, lat in station_data
		} for i in range(num_intervals)
	}

	for r in rds:
		i = int((r[1] - start_dt).total_seconds() / interval_td.total_seconds())
		ret[i][r[0]]['count'] += 1

	import sys
	print sys.getsizeof(ret)	

	return jsonify(ret)


@app.route('/bike_rides_interval_events_geojson')
def events_geojson():
	t_start = request.args.get('t_start')
	t_end = request.args.get('t_end')
	t_interval = request.args.get('t_interval')
	stations = request.args.getlist('station')
	subscribed = request.args.getlist('subscribed')

	stations = map(int, stations) if stations else [e[0] for e in db_session.query(BikeStation.id).all()]
	subscribed = map(bool, subscribed) if subscribed else [True, False]
	d, h, m, s = map(int, re.match('(\d*):(\d*):(\d*):(\d*)', t_interval).groups())
	interval_td = timedelta(days=d, hours=h, minutes=m, seconds=s)
	start_dt = datetime.strptime(t_start, '%Y-%m-%d %H:%M:%S')
	end_dt = datetime.strptime(t_end, '%Y-%m-%d %H:%M:%S')
	num_intervals = int(ceil((end_dt - start_dt).total_seconds() / interval_td.total_seconds()))

	bike_query = """
		select bike_rides.id, start_date, subscribed, ST_AsGeoJSON(geom)
		from bike_rides left join bike_stations on bike_rides.start_station_id=bike_stations.id
		where start_date >= '{0}' and end_date < '{1}' and bike_stations.id in {2} and subscribed in {3}
	""".format(t_start, t_end, str(tuple(stations)), str(tuple(subscribed)))
	rds = db_session.execute(bike_query).fetchall()

	ret = { i: [] for i in range(num_intervals) }

	for r in rds:
		i = int((r[1] - start_dt).total_seconds() / interval_td.total_seconds())
		feature = Feature(
			id=r[0],
			geometry=json.loads(r[3]),
			properties={ 'subscribed': r[2] }
		)
		ret[i].append(feature)
	for i in range(num_intervals):
		ret[i] = FeatureCollection(ret[i])

	return jsonify({'data': ret})


@app.route('/checkins')
def get_checkins():
	t_start = request.args.get('t_start')
	t_end = request.args.get('t_end')

	checkins_query = """
		select date, ST_X(geom), ST_Y(geom)
		from checkins
		where date >= '{0}' and date < '{1}'
		order by date asc
	""".format(t_start, t_end)
	checkins = db_session.execute(checkins_query).fetchall()

	ret = [{
		'date': datetime.strftime(c[0], '%Y-%m-%d %H:%M:%S'),
		'lng': c[1],
		'lat': c[2]
	} for c in checkins]
	return jsonify({'data': ret})


@app.route('/photos')
def get_photos():
	t_start = request.args.get('t_start')
	t_end = request.args.get('t_end')

	photos_query = """
		select id, date, ST_X(geom), ST_Y(geom)
		from photos
		where date >= '{0}' and date < '{1}'
		order by date asc
	""".format(t_start, t_end)
	photos = db_session.execute(photos_query).fetchall()

	ret = [{
		'id': p[0],
		'date': datetime.strftime(p[1], '%Y-%m-%d %H:%M:%S'),
		'lng': p[2],
		'lat': p[3]
	} for p in photos]
	return jsonify({'data': ret})


@app.route('/stations')
def get_stations():
	stations_query = """
		select id, ST_X(geom), ST_Y(geom) from bike_stations order by id asc
	"""
	stations = db_session.execute(stations_query).fetchall()

	ret = [{
		'id': s[0],
		'lng': s[1],
		'lat': s[2]
	} for s in stations]
	return jsonify({'data': ret})


@app.route('/rides')
def get_rides():
	t_start = request.args.get('t_start')
	t_end = request.args.get('t_end')

	rides_query = """
		select start_station_id, end_station_id, start_date, duration, subscribed
		from bike_rides
		where start_date >= '{0}' and start_date < '{1}'
	""".format(t_start, t_end)
	rides = db_session.execute(rides_query).fetchall()

	ret = [{
		'start_id': r[0],
		'end_id': r[1],
		'date': datetime.strftime(r[2], '%Y-%m-%d %H:%M:%S'),
		'duration': r[3],
		'subscribed': r[4]
	} for r in rides]
	return jsonify({'data': ret})


def preprocess_census_data(data):
	# CURRENTLY UNUSED
	# AND SOMEWHAT UNUSEFUL, MISLEADING
	
	with open('census_data_conversion.json', 'r') as f:
		form = json.load(f)

	ret = {}
	for c in form:
		# see the conversion document, the first item is the new name
		ret[form[c][0]] = []
		for f in form[c][1:]:
			old_name, new_name = f.keys()[0], f.values()[0]
			val = data[c][old_name] if old_name in data[c] else 0
			ret[form[c][0]].append({new_name: val})

	return ret

def to_topojson(geoj):
	# takes in a geojson string and outputs it in topojson
	# for space saving reasons
	process = Popen(['topojson', '-p'], stdout=PIPE, stdin=PIPE)
	ret, _ = process.communicate(geoj)
	return ret

def block_group_geometry(resolution='basic', threshold=0.01):
	# gets only geometry for those block groups that are
	# close to a bike station (within 100 meters)
	# resolution is basic or tiger
	stations_query = 'select st_asgeojson(st_collect(bike_stations.geom)) from bike_stations;'
	stations = db_session.execute(stations_query).fetchall()[0][0]
	query = """
		with const as (
			select st_setsrid(st_geomfromgeojson('{0}'), 4326) as c
		)
		select block_groups.id, st_asgeojson(block_groups.{1})
		from const cross join block_groups
		where st_distance(block_groups.{1}, const.c) < {2};
	""".format(stations, resolution, threshold)
	block_groups = db_session.execute(query).fetchall()
	features = []
	for bg in block_groups:
		geoj = Feature(geometry=loads(bg[1]), properties={'id': bg[0]})
		features.append(geoj)
	fc = FeatureCollection(features)
	topo = loads(to_topojson(dumps(fc)))
	return topo

def block_group_census(ids=None):
	if ids is None:
		query = 'select id, census_data from block_groups;'
	else:
		query = """
			select id, census_data from block_groups
			where id in {0};
		""".format(str(tuple(ids)))
	block_groups = db_session.execute(query).fetchall()
	ret = {}
	for bg in block_groups:
		ret[bg[0]] = preprocess_census_data(json.loads(bg[1]))
	return ret

@app.route('/block_groups')
def get_block_groups_handler():
	req_type = request.args.get('type') or 'all'
	ret = {}
	ids = None
	if req_type in ['geometry', 'all']:
		ret['geometry'] = block_group_geometry()
		ids = map(lambda x: x['properties']['id'], ret['geometry']['objects']['stdin']['geometries'])
	if req_type in ['census', 'all']:
		# TO DO: fix so it uses the IDs from block_group_geometry_local
		ret['census'] = block_group_census(ids)
	return jsonify(ret)


@app.route('/subway_stations')
def get_subway_stations():
	query = """
		select id, ST_X(geom), ST_Y(geom), name from subway_stations
	"""
	stations = db_session.execute(query).fetchall()
	ret = [{
		'id': s[0],
		'lng': s[1],
		'lat': s[2],
		'name': s[3]
	} for s in stations]
	return jsonify({'data': ret})


@app.route('/points_of_interest')
def get_points_of_interest():
	query = """
		select id, rank, ST_X(geom), ST_Y(geom), name from locations
	"""
	locations = db_session.execute(query).fetchall()
	ret = [{
		'id': s[0],
		'rank': s[1],
		'lng': s[2],
		'lat': s[3],
		'name': s[4]
	} for s in locations]
	return jsonify({'data': ret})


@app.route('/weather')
def get_weather():
	t_start = request.args.get('t_start')
	t_end = request.args.get('t_end')

	weather_query = """
		select datetime, temperature, precipitation, humidity
		from weather
		where datetime >= '{0}' and datetime < '{1}'
		order by datetime asc
	""".format(t_start, t_end)
	weather = db_session.execute(weather_query).fetchall()

	ret = [{
		'date': datetime.strftime(w[0], '%Y-%m-%d %H:%M:%S'),
		'temperature': w[1],
		'precipitation': w[2],
		'humidity': w[3]
	} for w in weather]
	return jsonify({'data': ret})


if __name__ == '__main__':
	app.run()

