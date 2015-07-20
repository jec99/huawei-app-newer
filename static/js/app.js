
angular.module('mapApp', ['mapApp.factories', 'mapApp.mapController', 'mapApp.dcControllers', 'ngMaterial'])

.controller('MainController', function ($scope, $rootScope, $q, bikeRides, stationData, bikeDirections) {
	return 0;
})


// credit for a lot of the charting code goes to the good people
// of Crossfilter, over at Square, with inspiration from the
// people at dc.js
.controller('CrossfilterController', function ($rootScope, $scope, $q, $timeout, ridesFactory, stationsFactory, photosFactory, blockGroupsFactory) {
	var t_start = '2012-06-01 00:00:00';
	var t_end = '2012-06-15 00:00:00';
	var map_center = [-77.034136, 38.843928];
	var map_radius = 0.4;
	var daysOfWeek = ['Su', 'M', 'T', 'W', 'Th', 'F', 'S'];
	
	var scatter_width = 944,
			scatter_height = 603,
			bounds = [
				[map_center[0] - map_radius, map_center[1] - map_radius * Math.cos(map_center[1] / 180 * Math.PI)],
				[map_center[0] + map_radius, map_center[1] + map_radius * Math.cos(map_center[1] / 180 * Math.PI)]
			];

	var xScatter = d3.scale.linear()
				.domain([bounds[0][0], bounds[1][0]])
				.range([0, scatter_width]),
			yScatter = d3.scale.linear()
				.domain([bounds[0][1], bounds[1][1]])
				.range([scatter_width, 0]);

	var scatter_charts,
			scatter_chart,
			hexbin_charts,
			hexbin_chart,
			charts,
			chart;

	var zoomRange = [1, 8];
	var zoom = d3.behavior.zoom()
		.x(xScatter)
		.y(yScatter)
		.scaleExtent(zoomRange);

	var elt = '.crossfilter-scatter svg';
	d3.select(elt)
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

		scatter_charts = [
			scatterPlot()
				.width(scatter_width)
				.height(scatter_height)
				.x(xScatter)
				.y(yScatter)
				.r(Math.sqrt)
				// semanticZoom changes the radius depending on the zoom level
				.zoom(zoom)
				.semanticZoom(Math.sqrt)
				// put the dimension and the group in later, when the data arrives
				.points(stations_list)
				// takes in the bound data and outputs [x, y]
				.coordinates(function (d) { return [d.lng, d.lat]; })
		];

		scatter_chart = d3.select(elt)
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
				duration = rides.dimension(function (e) { return e.duration; }),
				subscribed = rides.dimension(function (e) { return e.subscribed; }),
				start_station = rides.dimension(function (e) { return e.start_id; });

		var dates = date.group(d3.time.day),
				hours = hour.group(Math.floor),
				durations = duration.group(function (d) { return Math.floor(d / (5 * 60)); }),
				subscriptions = subscribed.group(),
				start_stations = start_station.group();

		scatter_charts[0]
			.dimension(start_station)
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

			barChart()
				.dimension(duration)
				.group(durations)
				.round(Math.round)
				.x(d3.scale.linear()
					.domain([0, 40])
					.rangeRound([0, 10 * 40]))
				.tickFormat(function (e) { return e * 5; })
		];
		
		chart = d3.selectAll('.crossfilter-chart')
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

		var g = d3.select(elt)
			.append('g')
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
			.style('fill', 'blue')
			.style('opacity', function (d) { return Math.max(0.1, Math.min(d.length / 100, 1)); });

		zoom.on('zoom.hexbin', zoomHexbinHandler);

		function zoomHexbinHandler () {
			hexagons = g.selectAll('path')
				.data(computeHexbins(), function (d) { return d.i + "," + d.j; });
			hexagons
				.style('opacity', function (d) { return Math.max(0.1, Math.min(d.length / 100, 1)); });

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
			- style
			- click to get info
		*/

		var g = d3.select(elt)
			.insert('g', ':first-child')
			.attr('class', 'block-groups-0')
			.attr('width', scatter_width)
			.attr('height', scatter_height);

		var path = d3.geo.path();
		path.projection(function (coords) {
			return coords.map(function (c) {
				return [xScatter(coords[0]), yScatter(coords[1])];
			});
		});

		block_groups = g.selectAll('path')
			.data(topojson.feature(data.geometry, data.geometry.objects.stdin).features)
			.enter().append('path')
			.attr('d', path)
			.attr('class', 'feature')
			.style('stroke-width', '0.75px');

		zoom.on('zoom.map', mapZoomHandler);
		function mapZoomHandler () {
			block_groups.style('stroke-width', 0.75 / d3.event.scale + 'px');
			g.attr("transform", "translate(" + d3.event.translate + ")scale(" + d3.event.scale + ")");
		}
	});

});



