-- finding the fastest route between two nodes

select seq, id1 as node, id2 as edge, reverse_cost, geom_way
from pgr_dijkstra('
	select id,
		source::integer,
		target::integer,
		cost::double precision
		from ways',
	30, 60, false, false)
a left join ways b
on a.id2 = b.id;

-- finding the nearest node
select
	case when ST_Distance(ST_Point(-77.0164, 38.9047), ST_Point(x1, y1)) >
			 ST_Distance(ST_Point(-77.0164, 38.9047), ST_Point(x2, y2))
			 then target
		 else source
	end as node
from ways
where ST_DWithin(ST_Point(x1, y1), ST_Point(-77.0164, 38.9047), 100, false) or ST_DWithin(ST_Point(x2, y2), ST_Point(-77.0164, 38.9047), 100, false)
order by LEAST(
	ST_Distance(ST_Point(-77.0164, 38.9047), ST_Point(x1, y1)),
	ST_Distance(ST_Point(-77.0164, 38.9047), ST_Point(x2, y2))
) asc limit 5;

-- faster but worse; let's use this
select case when ST_Distance(ST_Point(-77.0164, 38.9047), ST_Point(x1, y1)) >
			 ST_Distance(ST_Point(-77.0164, 38.9047), ST_Point(x2, y2))
			 then target
		 else source
	end as node, LEAST(
		ST_Distance(ST_Point(-77.0164, 38.9047), ST_Point(x1, y1)),
		ST_Distance(ST_Point(-77.0164, 38.9047), ST_Point(x2, y2))
	) as dist
from ways
order by ST_Point(-77.0164, 38.9047) <-> geom_way
limit 1;