

# # # # # # # # # # # # # # # # # # # # # # # # #
#                                               #
#   make sure to run                            #
#   $ lunchy start postgres                     #
#   before running any code                     #
#                                               #
#   also run                                    #
#   $ createdb dc                               #
#   if you don't already have a database        #
#   also, alter your environment variables so   #
#   $ $PGHOST == localhost                      #
#   $ $PGDATA == /usr/local/var/postgres        #
#                                               #
# # # # # # # # # # # # # # # # # # # # # # # # #

""" enabling postgis in your database (called cd here for example)

$ psql -d dc
# create extension postgis;
# \q

"""

#
# BOILERPLATE
#

from itertools import groupby
from datetime import datetime, timedelta

def dedup(ls, key=lambda x: x, keep='first'):
	gb = groupby(sorted(ls, key=key), key=key)
	if keep == 'last':
		return [reversed(g).next() for _, g in gb]
	else:
		return [g.next() for _, g in gb]
		

def round_time(dt, res):
	# res is in seconds
	seconds = dt.hour * 60 * 60 + dt.minute * 60 + dt.second
	rounding = (seconds + res / 2) // res * res
	return dt + timedelta(0, rounding - seconds, -dt.microsecond)


data_base = '/Users/julienclancy/Desktop/RIPS 2015/databases'
# just download the zipped folder and unpack in the data_base route
import json
import ijson  # for very large files
import os
import fiona
from Levenshtein import distance as leven_dist
from os import listdir, chdir, getcwd
from os.path import join as path_join
from datetime import datetime
from sqlalchemy import create_engine, case
from sqlalchemy.orm import scoped_session, sessionmaker
from sqlalchemy.ext.declarative import declarative_base

# all times are in EST
# all units are metric

import models
from models import Base, Weather, BlockGroup, BikeStation, BikeRide, \
	SubwayStation, SubwayDelay, Location
engine = create_engine('postgresql://localhost/dc', convert_unicode=True)
db_session = scoped_session(sessionmaker(
	autocommit=False,
	autoflush=False,
	bind=engine
))
Base.metadata.create_all(bind=engine)


#
# WEATHER
#

os.chdir(os.path.join(data_base, 'weather'))

weather_ls = []
direc = os.getcwd()
fnames = [os.path.join(direc, fn) for fn in listdir('.') if fn[0] != '.']
for fname in fnames:
	with open(fname, 'r') as f:
		dct = json.load(f)
	obs_day = []
	for obs in dct['history']['observations']:
		a = Weather()
		dt = obs['date']
		dt_str = ' '.join([dt['year'], dt['mon'], dt['mday'],
			              dt['hour'], dt['min']])
		a.datetime = datetime.strptime(dt_str, "%Y %m %d %H %M")

		a.snow = bool(int(obs['snow']))
		try:
			a.humidity = int(obs['hum'])
		except:
			a.humidity = 50
		a.temperature = float(obs['tempm'])
		a.precipitation = max(float(obs['precipm']), 0.0)

		obs_day.append(a)
	for i in range(len(obs_day)):
		obs_day[i].datetime = round_time(obs_day[i].datetime, 60 * 60)
		# round to the nearest hour
	if len(obs_day) < 24:
		print 'before:', len(obs_day)
	obs_day = dedup(obs_day, lambda x: x.datetime.hour)
	if len(obs_day) < 24:
		print 'after:', len(obs_day)
	weather_ls.extend(obs_day)

db_session.add_all(weather_ls)
db_session.commit()

#
# CENSUS DATA/SHAPES
#

"""
no longer relevant since we are using the JSON datatype
but let's keep it around in case someone finds it useful

field_names = {
	'household_income': 'Household Income',
	'rent': 'Contract Rent',
	'earnings': 'Workers\' Earnings',
	'income_white_not_hispanic': 'Per Capita Income (White Alone, Not Hispanic or Latino)',
	'sex_by_age': 'Sex by Age',
	'year_structure_built': 'Year Strucure Built',
	'income_white': 'Per Capita Income (White Alone)',
	'house_value': 'Value for Owner-Occupied Housing Units',
	'income': 'Per Capita Income',
	'income_other': 'Per Capita Income (Some Other Race Alone)',
	'income_quintile_upper': 'Household Income Quintile Upper Limits',
	'units_in_structure': 'Units in Structure',
	'income_asian': 'Per Capita Income (Asian Alone)',
	'household_type': 'Household Type',
	'household_size': 'Household Size',
	'transportation': 'Means of Transportation to Work',
	'income_native': 'Per Capita Income (American Indian and Alaska Native Alone)',
	'tenure': 'Tenure',
	'income_two_plus': 'Per Capita Income (Two or More Races)',
	'housing_units': 'Unweighted Sample Housing Units',
	'income_black': 'Per Capita Income (Black or African American Alone)',
	'income_hispanic': 'Per Capita Income (Hispanic or Latino)',
	'education': 'Educational Attainment',
	'population': 'Unweighted Sample Count of the Population',
	'income_islander': 'Per Capita Income (Native Hawaiian and Other Pacific Islander Alone)',
}
"""

os.chdir(os.path.join(data_base, 'Census ACS5'))

bgs = []
cities = [
	('alexandria', '51'),
	('arlington', '51'),
	('montgomery', '24'),
	('washington', '11')
]
st_lookup = {
	'51': 'VA',
	'11': 'DC',
	'24': 'MD'
}

shape_path_basic = 'shapefiles/basic'
shape_path_tiger = 'shapefiles/tiger'
states = ['DC', 'MD', 'VA']

for city, state in cities:
	shp = fiona.open('%s/%s/cb_2013_%s_bg_500k.shp' %
		(shape_path_basic, st_lookup[state], state))
	bg_shapes_basic = list(shp)
	shp.close()

	shp = fiona.open('%s/%s/tl_2014_%s_bg.shp' %
		(shape_path_tiger, st_lookup[state], state))
	bg_shapes_tiger = list(shp)
	shp.close()

	with open('survey data/processed/%s_processed.txt' % city, 'r') as f:
		dct = json.load(f)
	for k, v in dct.iteritems():
		bg = BlockGroup()
		bg.state = st_lookup[v['state']]
		bg.county = int(v['county'])
		bg.tract = int(v['tract'])
		bg.block_group = int(v['block group'])
		bg.geo_id = int(k)
		del v['state']
		del v['county']
		del v['tract']
		del v['block group']
		bg.census_data = v

		shape = (x for x in bg_shapes_basic if int(x['properties']['GEOID']) == bg.geo_id).next()
		# geometry comes in a list of pairs
		shape_pts = shape['geometry']['coordinates'][0]
		shape_str = ', '.join(map(lambda x: '{:.8f} {:.8f}'.format(x[0], x[1]), shape_pts))
		bg.basic = 'POLYGON ((%s))' % shape_str

		shape = (x for x in bg_shapes_tiger if int(x['properties']['GEOID']) == bg.geo_id).next()
		# geometry comes in a list of pairs
		shape_pts = shape['geometry']['coordinates'][0]
		shape_str = ', '.join(map(lambda x: '{:.8f} {:.8f}'.format(x[0], x[1]), shape_pts))
		bg.tiger = 'POLYGON ((%s))' % shape_str

		bgs.append(bg)

db_session.add_all(bgs)
db_session.commit()




#
# BIKE STATIONS
#

os.chdir(os.path.join(data_base, 'bikeshare'))

bike_stat_ls = []

with open('bike_stations.json', 'r') as f:
	dct = json.load(f)
for stat in dct:
	s = BikeStation()
	s.name = stat['name']
	s.geom = 'POINT ({:.8f} {:.8f})'.format(float(stat['lon']), float(stat['lat']))
	bike_stat_ls.append(s)

db_session.add_all(bike_stat_ls)
db_session.commit()




#
# BIKE RIDES
#

os.chdir(os.path.join(data_base, 'bikeshare'))

stations_hs = {s.name: s for s in bike_stat_ls}
with open('station_aliases.json', 'r') as f:
	aliases = json.load(f)
ride_ls = []
failed_ls = []
def find_station(stat_n):
	# finds the bike station using the Levenshtein distance if necessary
	if stat_n in stations_hs:
		return stations_hs[stat_n]
	elif stat_n.strip() in stations_hs:
		return stations_hs[stat_n.strip()]
	elif stat_n in aliases:
		return stations_hs[aliases[stat_n]]
	else:
		print 'couldn\'t find "%s"' % stat_n
		return min(stations_hs.values(), key=lambda x: leven_dist(x, stat_n))

f = open('ride_data.json', 'r')
dct = ijson.items(f, 'item')
# ijson lets us stream the file rather than open it all at once --- too big
i = 0
failed = 0

starting = 2453922

for j in range(starting):
	i += 1
	dct.next()

for r in dct:
	i += 1
	if i % 10000 == 0:
		print i
	ride = BikeRide()
	st_dt = datetime.strptime(r['start date'], "%Y-%m-%dT%H:%M:%S")
	ed_dt = datetime.strptime(r['end date'], "%Y-%m-%dT%H:%M:%S")
	ride.start_date = st_dt
	ride.end_date = ed_dt
	ride.duration = r['duration']
	ride.subscribed = False if r['user type'] == 'casual' else True
	try:
		ride.start_station = find_station(r['start station'])
		ride.end_station = find_station(r['end station'])
	except:
		failed += 1
		print 'fail number', failed
		failed_ls.append(r)
		continue
	ride_ls.append(ride)
f.close()

db_session.add_all(ride_ls)
db_session.commit()



#
# SUBWAY STATIONS
#

os.chdir(os.path.join(data_base, 'transit'))
subway_stats = {}
# {code: station} for ease of access
preseen = []
# there are some almost duplicate entries

with open('rail_station_list.json', 'r') as f:
	dct = json.load(f)

line_codes = ['LineCode%d' % i for i in range(1, 5)]
for stat in dct['Stations']:
	if stat['StationTogether1'] in preseen:
		cd = stat['StationTogether1']
		new_lines = [stat[n] for n in line_codes if stat[n] and stat[n] not in subway_stats[cd].lines]
		subway_stats[cd].lines.extend(new_lines)
	else:
		s = SubwayStation()
		s.name = stat['Name']
		s.lines = [stat[n] for n in line_codes if stat[n]]
		s.code = stat['Code']
		s.geom = 'POINT ({:.8f} {:.8f})'.format(stat['Lon'], stat['Lat'])
		subway_stats[s.code] = s

db_session.add_all(subway_stats.values())
db_session.commit()




#
# SUBWAY DELAYS
#

os.chdir(os.path.join(data_base, 'transit'))

subway_delays = []
subway_stats_name = {s.name: s for s in subway_stats.values()}

def find_station_sub(stat_n):
	# finds the bike station using the Levenshtein distance if necessary
	if stat_n in subway_stats_name:
		return subway_stats_name[stat_n]
	else:
		return min(subway_stats.values(), key=lambda x: leven_dist(x, stat_n))

with open('train_delays.txt', 'r') as f:
	dct = json.load(f)

for delay in dct:
	d = SubwayDelay()
	d.date = datetime.strptime(delay['date'], "%Y-%m-%dT%H:%M:%S")
	d.duration = int(delay['length']) * 60
	d.station = find_station_sub(delay['station'])
	subway_delays.append(d)

db_session.add_all(subway_delays)
db_session.commit()




#
# POINTS OF INTEREST (YELP)
#

# we do just the normal points of interest first, not groceries/parks/etc

os.chdir(os.path.join(data_base, 'yelp'))

points_of_interest = []

with open('yelp_all_processed.json', 'r') as f:
	dct = json.load(f)

for i, e in enumerate(dct):
	l = Location()
	l.name = e['name']
	l.rank = i + 1
	l.rating = e['rating']
	l.review_count = e['review_count']
	l.address = e['address'][0]
	l.categories = e['categories']
	l.geom = 'POINT ({:.8f} {:.8f})'.format(e['longitude'], e['latitude'])
	points_of_interest.append(l)

db_session.add_all(points_of_interest)
db_session.commit()




