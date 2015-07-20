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


def ride_statistics(rides_raw):
	rets = {}
	rides = [{
		'subscribed': e.subscribed,
		'hour': e.start_date.hour,
		'weekday': e.start_date.weekday(),
		'yearweek': e.start_date.timetuple().tm_yday / 7
	} for e in rides_raw]

	rets['day_by_hour'] = {
		'subscribed': [len([e for e in rides if e['hour'] == i and e['subscribed']]) for i in range(24)],
		'casual': [len([e for e in rides if e['hour'] == i and not e['subscribed']]) for i in range(24)],
		'total': [len([e for e in rides if e['hour'] == i]) for i in range(24)]
	}

	rets['week_by_day'] = {
		'casual': [len([e for e in rides if e['weekday'] == i and not e['subscribed']]) for i in range(7)],
		'subscribed': [len([e for e in rides if e['weekday'] == i and e['subscribed']]) for i in range(7)],
		'total': [len([e for e in rides if e['weekday'] == i]) for i in range(7)]
	}

	rets['year_by_week'] = {
		'subscribed': [len([e for e in rides if e['yearweek'] == i and e['subscribed']]) for i in range(52)],
		'casual': [len([e for e in rides if e['yearweek'] == i and not e['subscribed']]) for i in range(52)],
		'total': [len([e for e in rides if e['yearweek'] == i]) for i in range(52)]
	}

	return rets


@app.route('/rides_summary')
def get_rides_data_all():
	q = db_session.query(BikeRide).all()
	return jsonify(ride_statistics(q))


@app.route('/rides_summary/<int:start>/<int:end>')
def get_rides_data(start, end):
	# day x hour, week x day, year x week data, by subscription type
	q = db_session.query(BikeRide).filter(
		(BikeRide.start_station_id == start) & (BikeRide.end_station_id == end)
	)

	return jsonify(ride_statistics(q))


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

	return jsonify({ 'data': ret })


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
		select date, ST_X(geom), ST_Y(geom)
		from photos
		where date >= '{0}' and date < '{1}'
		order by date asc
	""".format(t_start, t_end)
	photos = db_session.execute(photos_query).fetchall()

	ret = [{
		'date': datetime.strftime(p[0], '%Y-%m-%d %H:%M:%S'),
		'lng': p[1],
		'lat': p[2]
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
	# TODO
	# - name the fields something usable
	fields = {
		'Contract Rent': {
			'name': 'Rent',
			'process': lambda x: x
		},
		'Educational Attainment': {
			'name': 'Education',
			'process': lambda x: x
		},
		'Means of Transportation to Work': {
			'name': 'Tranportation to Work',
			'process': lambda x: x
		},
		'Tenure': {
			'name': 'Housing Tenure',
			'process': lambda x: x
		},
		'Unweighted Sample Count of the Population': {
			'name': 'Population',
			'process': lambda x: x
		},
		'Unweighted Sample Housing Units': {
			'name': 'Housing Units',
			'process': lambda x: x
		},
		'Value for Owner-Occupied Housing Units': {
			'name': 'Housing Unit Value',
			'process': lambda x: x
		},
		'Sex by Age': {
			'name': 'Sex by Age',
			'process': lambda x: x
		},
		'Household Income': {
			'name': 'Household Income',
			'process': lambda x: x
		},
		'Per Capita Income': {
			'name': 'Per Capita Income',
			'process': lambda x: x
		}
	}

	ret = {}

	for category in data:
		if category in fields:
			ret[category] = {}
		else:
			continue
		for field in data[category]:
			if 'Margin of Error' not in field:
				ret[category][field] = data[category][field]

	return ret

def to_topojson(geoj):
	# takes in a geojson string and outputs it in topojson
	# for space saving reasons
	process = Popen(['topojson', '-p'], stdout=PIPE, stdin=PIPE)
	ret, _ = process.communicate(geoj)
	return ret

def block_group_geometry():
	# BE CAREFUL RETURNS TOPOJSON NOT GEOJSON
	# for speed and space reasons
	# it's 5x faster/smaller than geojson
	query = 'select id, ST_AsGeoJSON(tiger) from block_groups;'
	block_groups = db_session.execute(query).fetchall()
	features = []
	for bg in block_groups:
		geoj = Feature(geometry=loads(bg[1]), properties={'id': bg[0]})
		features.append(geoj)
	fc = FeatureCollection(features)
	topo = loads(to_topojson(dumps(fc)))
	# topo['transform']['scale'] = [1, 1]
	return topo

def block_group_census():
	query = 'select id, ST_AsGeoJSON(tiger) from block_groups;'
	block_groups = db_session.execute(query).fetchall()
	ret = {}
	for bg in block_groups:
		ret[bg[0]] = preprocess(json.loads(bg[1]))
	return ret

@app.route('/block_groups')
def get_block_groups_handler():
	req_type = request.args.get('type') or 'all'
	ret = {}
	if req_type in ['geometry', 'all']:
		ret['geometry'] = block_group_geometry()
	if req_type in ['census', 'all']:
		ret['census'] = block_group_census()
	return jsonify(ret)


if __name__ == '__main__':
	app.run()

