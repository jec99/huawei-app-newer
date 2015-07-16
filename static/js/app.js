
angular.module('mapApp', ['mapApp.factories', 'mapApp.mapController', 'mapApp.dcControllers', 'ngMaterial'])

.controller('MainController', function ($scope, $rootScope, $q, bikeRides, stationData, bikeDirections) {
	return 0;
})


// credit for a lot of the charting code goes to the good people
// of Crossfitler, over at Square, with inspiration from the
// people at dc.js
.controller('CrossfilterController', function ($scope, $q, $timeout, ridesFactory, stationsFactory) {
	var t_start = '2012-06-01 00:00:00';
	var t_end = '2012-06-15 00:00:00';
	var center = [-77.034136, 38.888928];
	var bounds = [[-77.2, 38.8], [-76.8, 39.1]];

	// zoom's not working in dc so i'm going to roll it myself
	// going through the dc source code is literally hell
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

		data[1].data.forEach(function (e) {
			e.date = new Date(e.date);
		});

		var e = data[1].data[data[1].data.length - 1];
		console.log(e.date);
		console.log(e.date.getHours() + e.date.getMinutes() / 60);

		// duration is in seconds
		// want to group as (in minutes)
		//   [0, 5, 10, 15, ...]
		//   [0, 5, 10, 15, 30, 60, infinity]
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

		// same order as in html
		var charts = [
			barChart()
				.dimension(hour)
				.group(hours)
				.x(d3.scale.linear()
					.domain([0, 24])
					.rangeRound([0, 10 * 24])),

			barChart()
				.dimension(date)
				.group(dates)
				.round(d3.time.day.round)
				.x(d3.time.scale()
					.domain([new Date(t_start), new Date(t_end)])
					.rangeRound([0, 10 * 90])),

			barChart()
				.dimension(duration)
				.group(durations)
				.x(d3.scale.linear()
					.domain([0, 40])
					.rangeRound([0, 10 * 40]))
		];

		var chart = d3.selectAll('.crossfilter-chart')
			.data(charts)
			.each(function (chart) {
				chart.on('brush', renderAll).on('brushend', renderAll);
			});

		renderAll();

		function render (method) {
			d3.select(this).call(method);
		}

		function renderAll () {
			chart.each(render);
			// more things here!
		}

		function barChart () {
			if (!barChart.id) {
				barChart.id = 0;
			}

			var margin = {top: 10, right: 10, bottom: 20, left: 10},
					x,
					y = d3.scale.linear().range([100, 0]),
					id = barChart.id++,
					axis = d3.svg.axis().orient('bottom'),
					brush = d3.svg.brush(),
					brushDirty,
					dimension,
					group,
					round;

			function chart (div) {
				var width = x.range()[1],
						height = y.range()[0];

				y.domain([0, group.top(1)[0].value]);

				div.each(function () {
					var div = d3.select(this),
							g = div.select('g');

					// initialize the chart if need be
					if (g.empty()) {
						// the best way to do the reset thing is to
						// angular $compile it and do ng-click,
						// but let's not worry about that now
						g = div.append('svg')
							.attr('width', width + margin.left + margin.right)
							.attr('height', height + margin.top + margin.bottom)
							.append('g')
							.attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

						g.append('clipPath')
							.attr('id', 'clip-' + id)
							.append('rect')
							.attr('width', width)
							.attr('height', height);

						g.selectAll('.bar')
							.data(['background', 'foreground'])
							.enter().append('path')
							.attr('class', function (d) { return d + ' bar'; })
							.datum(group.all());

						g.selectAll('.foreground.bar')
							.attr('clip-path', 'url(#clip-' + id + ')');

						g.append('g')
							.attr('class', 'axis')
							.attr('transform', 'translate(0,' + height + ')')
							.call(axis);

						var gBrush = g.append('g')
							.attr('class', 'brush')
							.call(brush);
						gBrush.selectAll('rect').attr('height', height);
						gBrush.selectAll('.resize').append('path').attr('d', resizePath);
					}

					// for redrawing the brush externally, that is,
					// not from the UI
					if (brushDirty) {
						brushDirty = false;
						g.selectAll('.brush').call(brush);
						if (brush.empty()) {
							g.selectAll('#clip-' + id + ' rect')
								.attr('x', 0)
								.attr('width', width);
						} else {
							var extent = brush.extent();
							g.selectAll('#clip-' + id + ' rect')
								.attr('x', x(extent[0]))
								.attr('width', x(extent[1]) - x(extent[0]));
						}
					}

					g.selectAll('.bar').attr('d', barPath);
				});

				function barPath (groups) {
					var path = [];
					for (var i = 0; i < groups.length; i++) {
						var d = groups[i];
						// this draws the bars based on the group
						// must return an appropriate key and value
						path.push('M', x(d.key), ',', height, 'V', y(d.value), 'h9V', height);
					}
					return path.join('');
				}

				function resizePath (d) {
					var e = +(d == 'e'),
							x = e ? 1 : -1,
							y = height / 3;
					// apparently this is SVG path information
					// see w3schools
					// return 'M' + (.5 * x) + ',' + y
					// 	+ 'A6,6 0 0 ' + e + ' ' + (6.5 * x) + ',' + (y + 6)
					// 	+ 'V' + (2 * y - 6)
					// 	+ 'A6,6 0 0 ' + e + ' ' + (.5 * x) + ',' + (2 * y)
					// 	+ 'Z'
					// 	+ 'M' + (2.5 * x) + ',' + (y + 8)
					// 	+ 'V' + (2 * y - 8)
					// 	+ 'M' + (4.5 * x) + ',' + (y + 8)
					// 	+ 'V' + (2 * y - 8);
					return '';
				}
			}

			brush.on('brushstart.chart', function () {
				var div = d3.select(this.parentNode.parentNode.parentNode);
				console.log(div);
				console.log(d3.select(this));
			});

			brush.on('brush.chart', function () {
				var g = d3.select(this.parentNode),
						extent = brush.extent();
				if (round) {
					extent = extent.map(round);
					g.select('.brush')
						.call(brush.extent(extent))
						.selectAll('.resize')
						.style('display', null);
				}
				g.select('#clip-' + id + ' rect')
					.attr('x', x(extent[0]))
					.attr('width', x(extent[1]) - x(extent[0]));

				// the real meat
				dimension.filterRange(extent);
			});

			brush.on('brushend.chart', function () {
				if (brush.empty()) {
					var div = d3.select(this.parentNode.parentNode.parentNode);
					div.select('#clip-' + id + ' rect').attr('x', null).attr('width', '100%');
					dimension.filterAll();
				}
			});

			chart.margin = function (_) {
				if (!arguments.length) {
					return margin;
				}
				margin = _;
				return chart;
			}

			chart.x = function (_) {
				if (!arguments.length) {
					return x;
				}
				x = _;
				axis.scale(x);
				brush.x(x);
				return chart;
			}

			chart.y = function (_) {
				if (!arguments.length) {
					return y;
				}
				y = _;
				return chart; 
			}

			chart.dimension = function (_) {
				if (!arguments.length) {
					return dimension;
				}
				dimension = _;
				return chart;
			}

			chart.filter = function (_) {
				if (_) {
					brush.extent(_);
					dimension.filterRange(_);
				} else {
					brush.clear();
					dimension.filterAll();
				}
				brushDirty = true;
				return chart;
			}

			chart.group = function (_) {
				if (!arguments.length) {
					return group;
				}
				group = _;
				return chart;
			}

			chart.round = function (_) {
				if (!arguments.length) {
					return round;
				}
				round = _;
				return chart;
			}

			return d3.rebind(chart, brush, 'on');
		}
	});


});





