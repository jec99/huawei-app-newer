
angular.module('mapApp', ['mapApp.factories', 'mapApp.mapController', 'mapApp.dcControllers', 'ngMaterial'])

.controller('MainController', function ($scope, $rootScope, $q, bikeRides, stationData, bikeDirections) {
	return 0;
})


// credit for a lot of the charting code goes to the good people
// of Crossfilter, over at Square, with inspiration from the
// people at dc.js
.controller('CrossfilterController', function ($rootScope, $scope, $q, $timeout, ridesFactory, stationsFactory, photosFactory, blockGroupsFactory, subwayStationsFactory, pointsOfInterestFactory) {
	var t_start = '2012-06-01 00:00:00';
	var t_end = '2012-06-15 00:00:00';
	// var map_center = [-77.034136, 38.843928];
	var map_center = [-77.034136, 38.96];
	var map_radius = 0.25;
	var daysOfWeek = ['Su', 'M', 'T', 'W', 'Th', 'F', 'S'];
	
	var scatter_width = 600,
			scatter_height = 600,
			bounds = [
				[map_center[0] - map_radius, map_center[1] - map_radius * Math.cos(map_center[1] / 180 * Math.PI)],
				[map_center[0] + map_radius, map_center[1] + map_radius * Math.cos(map_center[1] / 180 * Math.PI)]
			];

	var map_width = 600,
			map_height = 600;

	var xScatter = d3.scale.linear()
				.domain([bounds[0][0], bounds[1][0]])
				.range([0, scatter_width]),
			yScatter = d3.scale.linear()
				.domain([bounds[0][1], bounds[1][1]])
				.range([scatter_width, 0]),
			xScatterMap = d3.scale.linear()
				.domain([bounds[0][0], bounds[1][0]])
				.range([0, map_width]),
			yScatterMap = d3.scale.linear()
				.domain([bounds[0][1], bounds[1][1]])
				.range([map_width, 0])
			xScatterMapOriginal = xScatterMap.copy(),
			yScatterMapOriginal = yScatterMap.copy();

	var zoomRange = [1, 12];
	var zoom = d3.behavior.zoom()
		.x(xScatter)
		.y(yScatter)
		.scaleExtent(zoomRange);
	var zoomMap = d3.behavior.zoom()
		.x(xScatterMap)
		.y(yScatterMap)
		.scaleExtent(zoomRange);

	var scatter_charts,
			scatter_chart,
			hexbin_charts,
			hexbin_chart,
			charts,
			chart,
			minimap;

	var scatter_elt = '#scatterplot > svg';
	var map_elt = '#map-plot > svg'
	d3.select(scatter_elt)
		.call(zoom)
		.attr('width', scatter_width)
		.attr('height', scatter_height);

	function render (method) {
		d3.select(this).call(method);
	}

	function renderAll () {
		chart.each(render);
		scatter_chart.each(function (sc) { render(sc.rerender); });
	}

	stationsFactory.get().then(function (data) {
		/*
			TO DO:
			- make station radius relative to the maximum, like station color
			- make color represent proportion of users that are subscribed
		*/
		var stations = {},
				stations_list = [];
		for (var i = 0; i < data.data.length; i++) {
			var x = data.data[i];
			stations[x.id] = {
				lng: x.lng,
				lat: x.lat
			};
			stations_list.push({ id: x.id, lng: x.lng, lat: x.lat });			
		}

		var colors = d3.scale.cubehelix()
			.domain([0, 0.5, 1])
			.range([d3.hsl(240, .6, .3), d3.hsl(60, .6, 1), d3.hsl(-40, .6, .3)]);

		scatter_charts = [
			scatterPlot()
				.width(scatter_width)
				.height(scatter_height)
				.x(xScatter)
				.y(yScatter)
				.r(function (r) { return Math.max(Math.pow(r, 1/2), 3) / 2; })
				.opacity(function (r) { return 0.8; })
				.color(function (r) { return colors(Math.pow(r, 1/2)); })
				.zoom(zoom)
				// semanticZoom changes the radius depending on the zoom level
				.semanticZoom(function () { return 1; })
				// put the dimension and the group in later, when the data arrives
				.points(stations_list)
				// takes in the bound data and outputs [x, y]
				.coordinates(function (d) { return [d.lng, d.lat]; })
		];

		scatter_chart = d3.select(scatter_elt)
			.data(scatter_charts)
			.each(render);

		return ridesFactory.get(t_start, t_end);
	}).then(function (data) {
		data.data.forEach(function (e) {
			e.date = new Date(e.date);
		});

		var rides = crossfilter(data.data);

		var date = rides.dimension(function (e) { return e.date; }),
				hour = rides.dimension(function (e) { return e.date.getHours() + e.date.getMinutes() / 60; }),
				duration = rides.dimension(function (e) { return e.duration / 60; }),
				subscribed = rides.dimension(function (e) { return e.subscribed; }),
				start_station = rides.dimension(function (e) { return e.start_id; });

		var dates = date.group(d3.time.day),
				hours = hour.group(Math.floor),
				durations = duration.group(function (e) { return Math.floor(e / 5); }),
				subscriptions = subscribed.group(),
				start_stations = start_station.group();

		scatter_charts[0]
			.dimension(start_station)
			// use group.reduce instead of group.all if
			// you want something like a ratio of casual
			// to subscribed users
			.group(start_stations);

		charts = [
			barChart()
				.dimension(hour)
				.group(hours)
				// .round(Math.floor)
				.x(d3.scale.linear()
					.domain([0, 24])
					.rangeRound([0, 10 * 24]))
				.tickFormat(function (e) { return e % 4 == 0 ? e : null; }),

			barChart()
				.dimension(date)
				.group(dates)
				.round(d3.time.day.round)
				.x(d3.time.scale()
					.domain([new Date(t_start), new Date(t_end)])
					.rangeRound([0, 10 * 42]))
				.tickFormat(function (e) { return daysOfWeek[e.getDay()]; }),

			// something's messed up here
			barChart()
				.dimension(duration)
				.group(durations)
				.round(Math.floor)
				.x(d3.scale.linear()
					.domain([0, 40])
					.rangeRound([0, 10 * 40]))
				.tickFormat(function (e) { return e * 5; }),

			categoricalChart()
				.dimension(subscribed)
				.group(subscriptions)
				.x(d3.scale.ordinal()
					.domain([true, false])
					.rangePoints([0, 10 * 10], 1))
				.tickFormat(function (e) { return e; })
		];
		
		chart = d3.selectAll('#scatterplot .crossfilter-chart')
			.data(charts)
			.each(function (chart) {
				chart.on('brush', renderAll).on('brushend', renderAll);
			});

		renderAll();

		return photosFactory.get(t_start, t_end);
	}).then(function (data) {
		/*
			TO DO
				- put in charts.js instead of here
				- integrate with crossfilter
		*/

		data.data.forEach(function (e) {
			e.date = new Date(e.date);
		});

		var photos = crossfilter(data.data);
		var date = photos.dimension(function (e) { return e.date; });
		var dates = date.group(d3.time.day);

		var g = d3.select(scatter_elt)
			.insert('g', ':first-child')
			.attr('class', 'hexbin-0')
			.attr('width', scatter_width)
			.attr('height', scatter_height);

		// this actually creates a really cool effect where you can zoom on one
		// scatter plot and have the results be manifested on another, thanks
		// to the zoom modifying xScatter and yScatter in-place
		// var g = d3.select('#scatterplot')
		// 	.append('svg')
		// 	.append('g')
		// 	.attr('class', 'hexbin-0');

		// to register a new zoom listener: .on('zoom.namespace', function () {})

		var hexbin = d3.hexbin()
			.size([scatter_width, scatter_height])
			.radius(20)
			.x(function (e) { return xScatter(e.lng); })
			.y(function (e) { return yScatter(e.lat); });

		// change this later
		// currently the radius is not being used
		var r = d3.scale.linear()
			.domain([0, 10])
			.range([0, 10]);

		function computeHexbins () {
			var hexbins = hexbin(data.data);
			// maybe missing some bins, contrary to what the docs say
			// so we need to add them back
			var hex_hash = {};
			hexbins.forEach(function (h) {
				hex_hash[h.i + ',' + h.j] = 1;
			});
			hexbin.centers().forEach(function (c) {
				if (!((c.i + ',' + c.j) in hex_hash)) {
					var arr = [];
					arr.i = c.i;
					arr.j = c.j;
					arr.x = c[0];
					arr.y = c[1];
					hexbins.push(arr);
				}
			});
			return hexbins;
		}

		var hexagons = g.selectAll('path')
			.data(computeHexbins())
			.enter().append('path')
			.attr('d', hexbin.hexagon(19.5))
			.attr('transform', function (d) { return 'translate(' + d.x + ',' + d.y + ')'; })
			.style('fill', 'black')
			.style('opacity', function (d) {
				return Math.min(d.length / 100, 1);
			});

		zoom.on('zoom.hexbin', zoomHexbinHandler);

		function zoomHexbinHandler () {
			hexagons = g.selectAll('path')
				.data(computeHexbins(), function (d) { return d.i + "," + d.j; });
			hexagons
				.style('opacity', function (d) {
					return 0.1, Math.min(d.length / 100, 1);
				});

				// if you want to do something on zoom
				// .each(function (d) {
				// 	var elt = d3.select(this);
				// 	elt.attr('transform', elt.attr('transform') + 'scale(0.5)');
				// });
		}

		return blockGroupsFactory.get('geometry');
	}).then(function (data) {
		/*
			TO DO
			- click to get info
			- make the map have a selection box, so you can see where you've zoomed
					in the scatter plot
			- add in census data, put in crossfilter
			- puts in charts.js instead of here
		*/

		d3.select(map_elt).append('rect')
			.attr('class', 'overlay')
			.attr('width', map_width)
			.attr('height', map_height);

		var g = d3.select(map_elt)
			.call(zoomMap)
			.attr('width', map_width)
			.attr('height', map_height)
			.append('g')
			.attr('class', 'block-groups-0')
			.attr('width', map_width)
			.attr('height', map_height);

		var path = d3.geo.path();
		path.projection(function (coords) {
			return coords.map(function (c) {
				return [xScatterMap(coords[0]), yScatterMap(coords[1])];
			});
		});

		block_groups = g.selectAll('path')
			.data(topojson.feature(data.geometry, data.geometry.objects.stdin).features)
			.enter().append('path')
			.attr('d', path)
			.attr('class', 'feature');
			// .on('click', function (d) {
			// 	var elt = d3.select(this);
			// 	this.selected = !this.selected;
			// 	elt.classed('selected', this.selected);
			// });

		// creating the minimap

		// the common coordinate system the two maps share is lng-lat,
		// so we need to convert between these using scale.inverse(y)
		// then convert back. these are linear transformations so it's
		// computationally negligible
		// the y axes are inverted because in html y is measured down,
		// while in the real world it's measured up...

		function minimapCoords () {
			var x0_lnglat = xScatter.invert(0),
					y0_lnglat = yScatter.invert(scatter_height),
					x1_lnglat = xScatter.invert(scatter_width),
					y1_lnglat = yScatter.invert(0);

			// old minimap bug: takes into account translations/zooms in the
			// map pane. it shouldn't; we need to keep copies of the original
			// map x/y ranges and use those
			var x0 = xScatterMapOriginal(x0_lnglat),
					y0 = yScatterMapOriginal(y1_lnglat),
					x1 = xScatterMapOriginal(x1_lnglat),
					y1 = yScatterMapOriginal(y0_lnglat);

			return [[x0, y0], [x1, y1]];
		}

		var coords = minimapCoords();
		minimap = g.append('rect')
			.classed('minimap', true)
			.style('pointer-events', 'none')
			.attr('width', coords[1][0] - coords[0][0])
			.attr('height', coords[1][1] - coords[0][1])
			.attr('transform', 'translate(' + coords[0][0] + ',' + coords[0][1] + ')');

		zoomMap.on('zoom.map', mapZoomHandler);
		function mapZoomHandler () {
			g.style('stroke-width', 0.75 / Math.pow(d3.event.scale, 0.5) + 'px')
				.attr("transform", "translate(" + d3.event.translate + ")scale(" + d3.event.scale + ")");
		}

		zoom.on('zoom.minimap', minimapZoomHandler);
		function minimapZoomHandler () {
			var coords = minimapCoords();
			minimap
				.attr('width', coords[1][0] - coords[0][0])
				.attr('height', coords[1][1] - coords[0][1])
				.attr('transform', 'translate(' + coords[0][0] + ',' + coords[0][1] + ')');
		}

		return subwayStationsFactory.get();
	}).then(function (data) {
		var g = d3.select(map_elt)
			.append('g')
			.attr('class', 'subway-stations-0')
			.attr('width', map_width)
			.attr('height', map_height);

		var stations = g.selectAll('circle')
			.data(data.data)
			.enter().append('circle')
			.attr('r', 3)
			.style('fill', '#536DFE')
			.attr('transform', transform);

		zoomMap.on('zoom.subway_stations', function () {
			stations.attr('transform', transform);
		});

		var semanticZoom = Math.sqrt;

		function transform (d) {
			var coords = [d.lng, d.lat];
			var scaling = d3.event ? semanticZoom(d3.event.scale) : zoomMap.scaleExtent()[0];
			return 'translate(' + xScatterMap(coords[0]) + ',' + yScatterMap(coords[1]) + ')scale(' + scaling + ')';
		}
		return pointsOfInterestFactory.get();
	}).then(function (data) {
		var g = d3.select(map_elt)
				.append('g')
				.attr('class', 'locations-0')
				.attr('width', map_width)
				.attr('height', map_height);

		var locations = g.selectAll('circle')
			.data(data.data)
			.enter().append('circle')
			.attr('r', function (d) { return 7 / Math.pow(d.rank, 1 / 2); })
			.style('fill', '#FF5252')
			.attr('transform', transform);

		zoomMap.on('zoom.locations', function () {
			locations.attr('transform', transform);
		});

		var semanticZoom = Math.sqrt;

		function transform (d) {
			var coords = [d.lng, d.lat];
			var scaling = d3.event ? semanticZoom(d3.event.scale) : zoomMap.scaleExtent()[0];
			return 'translate(' + xScatterMap(coords[0]) + ',' + yScatterMap(coords[1]) + ')scale(' + scaling + ')';
		}
	});
});



