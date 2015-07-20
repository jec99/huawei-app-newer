
from sqlalchemy import create_engine, func, and_, or_
from sqlalchemy.orm import scoped_session, sessionmaker
from geojson import Feature, FeatureCollection, dumps, loads
from subprocess import Popen, PIPE
import json
import sys

engine = create_engine('postgresql://localhost/dc', convert_unicode=True)
db_session = scoped_session(sessionmaker(
	autocommit=False,
	autoflush=False,
	bind=engine
))

def to_topojson(geoj):
	# takes in a geojson string and outputs it in topojson
	# for space saving reasons
	process = Popen(['topojson', '-p'], stdout=PIPE, stdin=PIPE)
	ret, _ = process.communicate(geoj)
	return ret

if __name__ == '__main__':
	query = 'select id, ST_AsGeoJSON(tiger) from block_groups;'
	block_groups = db_session.execute(query).fetchall()
	features = []
	for bg in block_groups:
		geoj = Feature(geometry=loads(bg[1]), properties={'id': bg[0]})
		features.append(geoj)
	fc = FeatureCollection(features)
	topo = to_topojson(dumps(fc))
	with open(sys.argv[1], 'w') as f:
		f.write(topo)
