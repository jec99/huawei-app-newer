from flask import Flask, request, session, g, redirect, url_for, Response, \
	abort, render_template, flash, jsonify, send_from_directory

from sqlalchemy import create_engine, case, and_, or_
from sqlalchemy.orm import scoped_session, sessionmaker
from sqlalchemy.ext.declarative import declarative_base
import geoalchemy2.functions as func

import json
from geojson import Feature, FeatureCollection, dumps

# from database import db_session
import models
from models import Weather, BlockGroup, BikeStation, BikeRide, \
	SubwayStation, SubwayDelay, Location, Base

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

# Base.metadata.create_all(bind=engine)

app = Flask(__name__)
app.config.from_object(__name__)

@app.teardown_appcontext
def shutdown_session(exception=None):
    db_session.remove()

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

if __name__ == '__main__':
	app.run()
