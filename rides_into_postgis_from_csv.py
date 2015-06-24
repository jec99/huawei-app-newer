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

from pandas import read_csv

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


filenames = [
	# '2012Q1.csv',
	# '2012Q2.csv',
	# '2012Q3.csv',
	# '2012Q4.csv',
	# '2014Q1.csv',
	'2014Q2.csv',
	# '2014Q3.csv',
	# '2014Q4.csv'
]

f_base = '/Users/julienclancy/Desktop/RIPS 2015/databases/bikeshare'
filenames = ['%s/%s' % (f_base, f) for f in filenames]

def convert_file(fname, out_arr):

	def get_date(item):
		dt = None
		try:
			dt = datetime.strptime(item, "%m/%d/%y %H:%M")
		except:
			try:
				dt = datetime.strptime(item, "%y-%m-%d %H:%M")
			except:
				try:
					dt = datetime.strptime(item, "%Y-%m-%d %H:%M")
				except:
					dt = datetime.strptime(item, "%m/%d/%Y %H:%M")
		return dt

	i = 0
	f = open(fname, 'rU')
	reader = read_csv(f, engine='c', header=0)
	for _, row in reader.iterrows():
		r = BikeRide()

		tm = row['Duration']
		tm = tm.replace('h ', ':').replace('m ', ':').replace('sec.', '').replace('s', '')
		h, m, s = map(int, tm.split(':'))
		r.duration = h * 60 * 60 + m * 60 + s

		r.start_date = get_date(row['Start date'])
		r.end_date = get_date(row['End date'])
		try:
			r.start_station = find_station(row['Start Station'])
			r.end_station = find_station(row['End Station'])
		except:
			print 'couldnt find', row['Start Station'], 'or', row['End Station']
			continue
		r.subscribed = False if row['Subscription Type'] == 'Casual' else True
		out_arr.append(r)

		i += 1
		if i % 10000 == 0:
			print i
	f.close()

for fname in filenames:
	out_arr = []
	convert_file(fname, out_arr)

	for i in range(0, len(out_arr) + 1, 10000):
		db_session.add_all(out_arr[i:(i + 10000)])
		db_session.commit()
		print 'loaded part', i / 10000, 'of about', len(out_arr) / 10000


	out_arr = None
	gc.collect()
