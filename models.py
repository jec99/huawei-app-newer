
from sqlalchemy.orm import relationship, backref
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy import Column, Integer, BigInteger, Float, String, \
	DateTime, Boolean, ForeignKey
from sqlalchemy.dialects.postgresql import JSON, ARRAY
from geoalchemy2 import Geometry

Base = declarative_base()


class Weather(Base):
	__tablename__ = 'weather'
	id = Column(Integer, primary_key=True)
	datetime = Column(DateTime, index=True)
	snow = Column(Boolean)
	humidity = Column(Integer)  # percentage
	temperature = Column(Float)  # degrees c
	precipitation = Column(Float)  # mm


class BlockGroup(Base):
	__tablename__ = 'block_groups'
	id = Column(Integer, primary_key=True)
	state = Column(String(3))
	county = Column(Integer)
	tract = Column(Integer)
	block_group = Column(Integer)
	geo_id = Column(BigInteger)
	census_data = Column(JSON)
	basic = Column(Geometry('POLYGON'))
	tiger = Column(Geometry('POLYGON'))


class BikeStation(Base):
	__tablename__ = 'bike_stations'
	id = Column(Integer, primary_key=True)
	name = Column(String)
	# rides_end = relationship('BikeRide', backref=backref('end_station'))
	# rides_start = relationship('BikeRide', backref=backref('start_station'))
	geom = Column(Geometry('POINT'))


class BikeRide(Base):
	__tablename__ = 'bike_rides'
	id = Column(Integer, primary_key=True)
	duration = Column(Integer)  # in seconds
	start_date = Column(DateTime)
	end_date = Column(DateTime)
	subscribed = Column(Boolean)
	start_station_id = Column(Integer, ForeignKey('bike_stations.id'))
	end_station_id = Column(Integer, ForeignKey('bike_stations.id'))

	start_station = relationship('BikeStation', foreign_keys=[start_station_id], backref=backref('start_rides'))
	end_station = relationship('BikeStation', foreign_keys=[end_station_id], backref=backref('end_rides'))


class SubwayStation(Base):
	__tablename__ = 'subway_stations'
	id = Column(Integer, primary_key=True)
	name = Column(String)
	code = Column(String(4))
	lines = Column(ARRAY(String))
	delays = relationship('SubwayDelay', backref=backref('station'))
	geom = Column(Geometry('POINT'))


class SubwayDelay(Base):
	__tablename__ = 'subway_delays'
	id = Column(Integer, primary_key=True)
	date = Column(DateTime)
	duration = Column(Integer)  # seconds
	station_id = Column(Integer, ForeignKey('subway_stations.id'))


class Location(Base):
	__tablename__ = 'locations'
	id = Column(Integer, primary_key=True)
	name = Column(String)
	rank = Column(Integer)  # according to Yelp
	rating = Column(Float)
	review_count = Column(Integer)
	address = Column(String)
	categories = Column(ARRAY(String))
	geom = Column(Geometry('POINT'))


