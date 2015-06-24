
# this script is separate because we need to keep clearing memory
# to get it to work. there are too many entries...


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
import gc
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


os.chdir(os.path.join(data_base, 'bikeshare'))

stations_hs = {s.name: s for s in db_session.query(BikeStation).all()}
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

for r in dct:
	i += 1
	if i % 10000 == 0:
		print i

	ride = BikeRide()
	try:
		ride.start_station = find_station(r['start station'])
		ride.end_station = find_station(r['end station'])
	except:
		print 'failed on station', r['start station'], 'or', r['end station']
	try:
		st_dt = datetime.strptime(r['start date'], "%Y-%m-%dT%H:%M:%S")
		ed_dt = datetime.strptime(r['end date'], "%Y-%m-%dT%H:%M:%S")
		ride.start_date = st_dt
		ride.end_date = ed_dt
		ride.duration = r['duration']
		ride.subscribed = False if r['user type'] == 'casual' else True
		# ride_ls.append(ride)
	except :
		failed += 1
		print 'fail number', failed
		print {'ride': r, 'exception': e}
		failed_ls.append({'ride': r, 'exception': e})
		continue

	# if i % 100000 == 0:
	# 	db_session.add_all(ride_ls)
	# 	db_session.commit()
	# 	del ride_ls
	# 	gc.collect()
	# 	ride_ls = []
	# 	print 'loaded part', i / 100000, 'of about 50'

f.close()

# db_session.add_all(ride_ls)
# db_session.commit()

with open('failed.json', 'w') as f:
	json.dump(failed_ls, f)

"""
for r in dct:
	i += 1
	if i % 10000 == 0:
		print i
	try:
		ride = BikeRide()
		st_dt = datetime.strptime(r['start date'], "%Y-%m-%dT%H:%M:%S")
		ed_dt = datetime.strptime(r['end date'], "%Y-%m-%dT%H:%M:%S")
		ride.start_date = st_dt
		ride.end_date = ed_dt
		ride.duration = r['duration']
		ride.subscribed = False if r['user type'] == 'casual' else True
		ride.start_station = find_station(r['start station'])
		ride.end_station = find_station(r['end station'])
		# ride_ls.append(ride)
	except Exception as e:
		failed += 1
		print 'fail number', failed
		print {'ride': r, 'exception': e}
		failed_ls.append({'ride': r, 'exception': e})
		continue

	# if i % 100000 == 0:
	# 	db_session.add_all(ride_ls)
	# 	db_session.commit()
	# 	del ride_ls
	# 	gc.collect()
	# 	ride_ls = []
	# 	print 'loaded part', i / 100000, 'of about 50'

f.close()

# db_session.add_all(ride_ls)
# db_session.commit()

with open('failed.json', 'w') as f:
	json.dump(failed_ls, f)
"""