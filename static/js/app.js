
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

		function scatterPlot () {
			if (!scatterPlot.id) {
				scatterPlot.id = 0;
			}

			var config = {
				x: null,
				y: null,
				r: null,
				width: null,
				height: null,
				zoomRange: null,
				semanticZoom: null,
				dimension: null,
				group: null,
				points: null,
				coordinates: null
			};


			// real locals, not configs
			var id = scatterPlot.id++;
			var circle = null;

			function chart (div) {
				div.each(function () {
					var div = d3.select(this),
							g = div.select('g')

					if (g.empty()) {
						g = div.append('svg')
							.attr('width', config.width)
							.attr('height', config.height)
							.append('g')
							.call(d3.behavior.zoom()
								.x(config.x)
								.y(config.y)
								.scaleExtent(config.zoomRange)
								.on('zoom', zoom));
						g.append('rect')
							.attr('class', 'overlay')
							.attr('width', config.width)
							.attr('height', config.height);

						circle = g.selectAll('circle')
							.data(config.points)
							.enter().append('circle');	
					}

					circle
						.attr('r', function () { return Math.random() * 2 + 1; })
						.attr('transform', transform);
				});

				function zoom () {
					circle.attr('transform', transform);
				}

				function transform (d) {
					var coords = config.coordinates(d);
					var scaling = d3.event ? config.semanticZoom(d3.event.scale) : config.zoomRange[0];
					return 'translate(' + config.x(coords[0]) + ',' + config.y(coords[1]) + ')scale(' + scaling + ')';
				}
			}

			chart.rerender = function () {
				// preprocessing; can't modify the group sadly
				// but this is what, <363 items? in linear time?
				// lol i
				var hash = config.group.all().reduce(function (o, g) {
					o[g.key] = g.value;
					return o;
				}, {});

				circle.attr('r', function (d) {
					return hash[d.id] ? config.r(hash[d.id]) + 1 : 1;
				});
			};

			// dry as hell
			var configSetter = function (attrName) {
				return function (_) {
					if (!arguments.length) {
						return config[attrName];
					}
					config[attrName] = _;
					return chart;
				};
			}

			for (var conf in config) {
				chart[conf] = configSetter(conf);
			}

			return chart;
		}
	

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
					round,
					barWidth = 9;

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

						// hacky
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

				// hacky and bad; doesn't create bar objects, just one huge bar,
				// and makes a long path. kinda bad actually
				function barPath (groups) {
					var path = [];
					for (var i = 0; i < groups.length; i++) {
						var d = groups[i];
						// this draws the bars based on the group
						// must return an appropriate key and value

						// the 9 part controls the width of the bars
						path.push('M', x(d.key), ',', height, 'V', y(d.value), 'h' + barWidth + 'V', height);
					}
					return path.join('');
				}
			}

			brush.on('brushstart.chart', function () {
				var div = d3.select(this.parentNode.parentNode.parentNode);
			});

			brush.on('brush.chart', function () {
				var g = d3.select(this.parentNode),
						extent = brush.extent();
				if (round) {
					extent = extent.map(round);
					g.select('.brush')
						.call(brush.extent(extent));
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

			// the dry approach doesn't work here because it ends up creating config
			// as a class variable rather than an instance variable; not enough time
			// to fix it right now

			chart.margin = function (_) {
				if (!arguments.length) {
					return margin;
				}
				margin = _;
				return chart;
			};

			chart.x = function (_) {
				if (!arguments.length) {
					return x;
				}
				x = _;
				axis.scale(x);
				brush.x(x);
				return chart;
			};

			chart.y = function (_) {
				if (!arguments.length) {
					return y;
				}
				y = _;
				return chart; 
			};

			chart.dimension = function (_) {
				if (!arguments.length) {
					return dimension;
				}
				dimension = _;
				return chart;
			};

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
			};

			chart.group = function (_) {
				if (!arguments.length) {
					return group;
				}
				group = _;
				return chart;
			};

			chart.round = function (_) {
				if (!arguments.length) {
					return round;
				}
				round = _;
				return chart;
			};

			chart.tickFormat = function (tf) {
				axis.tickFormat(tf);
				return chart;
			};

			chart.barWidth = function (_) {
				if (!arguments.length) {
					return barWidth;
				}
				barWidth = _;
				return chart;
			};

			return d3.rebind(chart, brush, 'on');
		}
	});


});





