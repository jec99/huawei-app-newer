
angular.module('mapApp', ['mapApp.factories', 'mapApp.mapController', 'mapApp.dcControllers', 'ngMaterial'])

.controller('MainController', function ($scope, $rootScope, $q, bikeRides, stationData, bikeDirections) {
	return 0;
})


// credit for a lot of the charting code goes to the good people
// of Crossfilter, over at Square, with inspiration from the
// people at dc.js
.controller('CrossfilterController', function ($rootScope, $scope, $q, $timeout, ridesFactory, stationsFactory, photosFactory) {
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
		data.data.forEach(function (e) {
			e.date = new Date(e.date);
		});

		var photos = crossfilter(data.data);
		var date = photos.dimension(function (e) { return e.date; });
		var dates = date.group(d3.time.day);

		var g = d3.select(elt)
			.append('g')
			.attr('class', 'hexbin-0');

		// to register a new zoom listener: .on('zoom.namespace', function () {})

		var hexbin = d3.hexbin()
			.size([scatter_width, scatter_height])
			.radius(20)
			.x(function (e) { return xScatter(e.lng) })
			.y(function (e) { return yScatter(e.lat) });

		// change this later
		var r = d3.scale.linear()
			.domain([0, 10])
			.range([0, 10]);

		var hexagons = g.selectAll('path')
			.data(hexbin(data.data))
			.enter().append('path')
			.attr('d', hexbin.hexagon(19.5))
			.attr('transform', function (d) { return 'translate(' + d.x + ',' + d.y + ')'; })
			.style('fill', 'blue');

		zoom.on('zoom.hexbin', zoomHexbinHandler);

		// works but not optimal
		// optimally we'd just have a hexagonal tiling for the entire place, then
		function zoomHexbinHandler () {
			hexagons = hexagons
				.data(hexbin(data.data), function(d) { return d.i + "," + d.j; });

			hexagons.exit().remove();

			hexagons.enter().append('path')
				.attr("d", hexbin.hexagon(19.5))
				.attr('transform', function (d) { return 'translate(' + d.x + ',' + d.y + ')'; })
				.style('fill', 'blue');
		}

		function transformHexbin (d) {
			return 'translate(' + xScatter(d.x) + ',' + yScatter(d.y) + ')';
		}
	});

	// translate when zooming
	// scale when zooming (?)
	// link up with crossfilter

});



