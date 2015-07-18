
angular.module('mapApp', ['mapApp.factories', 'mapApp.mapController', 'mapApp.dcControllers', 'ngMaterial'])

.controller('MainController', function ($scope, $rootScope, $q, bikeRides, stationData, bikeDirections) {
	return 0;
})


// credit for a lot of the charting code goes to the good people
// of Crossfitler, over at Square, with inspiration from the
// people at dc.js
.controller('CrossfilterController', function ($rootScope, $scope, $q, $timeout, ridesFactory, stationsFactory) {
	var t_start = '2012-06-01 00:00:00';
	var t_end = '2012-06-15 00:00:00';
	var map_center = [-77.034136, 38.843928];
	var map_radius = 0.4;
	var daysOfWeek = ['Su', 'M', 'T', 'W', 'Th', 'F', 'S'];
	
	$q.all([
		stationsFactory.get(),
		ridesFactory.get(t_start, t_end)
	]).then(function (data) {
		var stations = {};
		for (var i = 0; i < data[0].data.length; i++) {
			var x = data[0].data[i];
			stations[x.id] = {
				lng: x.lng,
				lat: x.lat
			};
		}
		stations_list = [];
		for (var x in stations) {
			stations_list.push({ id: x, lng: stations[x].lng, lat: stations[x].lat });
		}

		data[1].data.forEach(function (e) {
			e.date = new Date(e.date);
		});

		var rides = crossfilter(data[1].data);

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

		/* CREATING THE GRAPH/SCATTERPLOT */

		var scatter_width = 944,
				scatter_height = 603,
				// bounds = [[-77.285, 38.77], [-76.809, 39.14]],
				bounds = [
					[map_center[0] - map_radius, map_center[1] - map_radius * Math.cos(map_center[1] / 180 * Math.PI)],
					[map_center[0] + map_radius, map_center[1] + map_radius * Math.cos(map_center[1] / 180 * Math.PI)]
				]
				div = '.crossfilter-scatter';
		
		var scatter_charts = [
			scatterPlot()
				.width(scatter_width)
				.height(scatter_height)
				.x(d3.scale.linear()
					.domain([bounds[0][0], bounds[1][0]])
					.range([0, scatter_width]))
				.y(d3.scale.linear()
					.domain([bounds[0][1], bounds[1][1]])
					// not scatter_height because of scaling reasons
					.range([scatter_width, 0]))
				.r(function (x) { return Math.sqrt(x) + 1; })
				.zoomRange([1, 8])
				// semanticZoom changes the radius depending on the zoom level
				.semanticZoom(Math.sqrt)
				.dimension(start_station)
				.group(start_stations)
				.points(stations_list)
				.coordinates(function (d) { return [d.lng, d.lat]; })
		];

		var scatter_chart = d3.select(div)
			.data(scatter_charts);

		/* CREATING THE CHARTS */
		// same order as in the html
		var charts = [
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

		// this part is the one that controls the order of the charts
		var chart = d3.selectAll('.crossfilter-chart')
			.data(charts)
			.each(function (chart) {
				chart.on('brush', renderAll).on('brushend', renderAll);
			});

		scatter_chart.each(render);
		renderAll();

		function render (method) {
			d3.select(this).call(method);
		}

		function renderAll () {
			chart.each(render);
			scatter_chart.each(function (sc) { render(sc.rerender); });
		}

	});

});





