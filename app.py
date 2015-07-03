from flask import Flask, request, session, g, redirect, url_for, Response, \
	abort, render_template, flash, jsonify, send_from_directory

from sqlalchemy import create_engine
from sqlalchemy.orm import scoped_session, sessionmaker
from sqlalchemy.ext.declarative import declarative_base
import geoalchemy2.functions as func
from geoalchemy2 import Geometry

import json
from geojson import Feature, FeatureCollection, dumps

# from database import db_session
import models
from models import Weather, BlockGroup, BikeStation, BikeRide, \
	SubwayStation, SubwayDelay, Location, Base

from numpy import isclose

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
app.config.from_object(__name__)


@app.teardown_appcontext
def shutdown_session(exception=None):
    db_session.remove()
    db_session_routing.remove()


@app.route('/')
def main():
	return send_from_directory('static/html', 'index_2.html')


@app.route('/data_sample')
def get_data():
	w = db_session.query(Weather).first()
	return jsonify({
		'temp': w.temperature,
		'hum': w.humidity,
		'precip': w.precipitation,
		'datetime': w.datetime.isoformat()
	})


@app.route('/station_data')
def get_geojson():
	rets = []
	st = db_session.query(BikeStation).limit(25)
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
def get_rides(start, end):
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


if __name__ == '__main__':
	app.run()
