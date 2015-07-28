
angular.module('mapApp', ['mapApp.factories', 'mapApp.mapController', 'ngMaterial'])

.controller('MainController', function ($scope, $rootScope, $q, bikeRides, stationData, bikeDirections) {
	return 0;
})


// credit for a lot of the charting code goes to the good people
// of Crossfilter, over at Square, with inspiration from the
// people at dc.js
.controller('CrossfilterController', function ($rootScope, $scope, $q,
		$timeout, ridesFactory, stationsFactory, photosFactory, blockGroupsFactory,
		subwayStationsFactory, pointsOfInterestFactory, weatherFactory) {
	var t_start = '2012-06-01 00:00:00';
	var t_end = '2012-06-15 00:00:00';
	// var map_center = [-77.034136, 38.843928];
	var map_center = [-77.034136, 38.96];
	var map_radius = 0.25;
	var daysOfWeek = ['Su', 'M', 'T', 'W', 'Th', 'F', 'S'];
	
	var scatter_width = 500,
			scatter_height = 500,
			bounds = [
				[map_center[0] - map_radius, map_center[1] - map_radius * Math.cos(map_center[1] / 180 * Math.PI)],
				[map_center[0] + map_radius, map_center[1] + map_radius * Math.cos(map_center[1] / 180 * Math.PI)]
			];

	var map_width = 500,
			map_height = 500;

	var xScatter = d3.scale.linear()
				.domain([bounds[0][0], bounds[1][0]])
				.range([0, scatter_width]),
			yScatter = d3.scale.linear()
				.domain([bounds[0][1], bounds[1][1]])
				.range([scatter_width, 0]);

	var zoomRange = [1, 12];
	var zoom = d3.behavior.zoom()
		.x(xScatter)
		.y(yScatter)
		.scaleExtent(zoomRange);

	var scatter_charts,
			scatter_chart,
			hexbin_charts,
			hexbin_chart,
			ride_charts,
			ride_chart,
			weather_charts,
			weather_chart,
			minimap;

	var scatter_elt = '#scatterplot > svg';
	var map_elt = '#map-plot > svg'
	d3.select(scatter_elt)
		.call(zoom)
		.attr('width', scatter_width)
		.attr('height', scatter_height);

	d3.select(map_elt)
		.call(zoom)
		.attr('width', map_width)
		.attr('height', map_height)
		.append('rect')
		.attr('class', 'overlay')
		.attr('width', map_width)
		.attr('height', map_height);

	function render (method) {
		d3.select(this).call(method);
	}

	function renderAll () {
		ride_chart.each(render);
		weather_chart.each(render);
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

		var color_mod = function (x) {
			return Math.pow((x + 1) / 2, 2);
		};

		scatter_charts = [
			scatterPlot()
				.width(scatter_width)
				.height(scatter_height)
				.x(xScatter)
				.y(yScatter)
				// sometimes you want attributes, like r, color, opacity, etc., to
				// be based on absolute values, sometimes on relative values. this
				// defines a scalar relative value metric, and its maximum and
				// minimum are passed into r, opacity, and color.
				.relativeComparator(function (v) {
					return v.subscribed - v.casual;
				})
				.r(function (v) {
					if (v === undefined) return 1;
					return Math.max(Math.pow(v.casual + v.subscribed, 1/2), 3) / 2;
				})
				.opacity(function () {
					return 0.8;
				})
				.color(function (v) {
					if (v === undefined) return colors(0.5);
					return colors(color_mod((v.subscribed - v.casual) / (v.subscribed + v.casual)));
				})
				.zoom(zoom)
				// semanticZoom changes the radius depending on the zoom level
				.semanticZoom(function (s) { return 1; })
				// put the dimension and the group in later, when the data arrives
				.points(stations_list)
				// takes in the bound data and outputs [x, y]
				.coordinates(function (d) { return [d.lng, d.lat]; })
		];

		scatter_chart = d3.select(scatter_elt)
			.data(scatter_charts)
			.each(render);

		return $q.all([
			ridesFactory.get(t_start, t_end),
			weatherFactory.get(t_start, t_end)
		]);
	}).then(function (data) {
		var rds = data[0].data,
				wthr = data[1].data;

		wthr.forEach(function (e) {
			e.date = new Date(e.date);
		});

		var flag = 1;
		rds.forEach(function (e) {
			e.date = new Date(e.date);
			e.weather = getWeather(e.date);
		});

		var rides = crossfilter(rds);

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

		start_stations.reduce(
			function (p, v) {
				p.subscribed += Number(v.subscribed);
				p.casual += Number(!v.subscribed);
				return p;
			}, function (p, v) {
				p.subscribed -= Number(v.subscribed);
				p.casual -= Number(!v.subscribed);
				return p;
			}, function () {
				return {
					subscribed: 0,
					casual: 0
				}
			}
		);

		function getWeather (dt) {
			// maybe buggy
			var hour = Math.min(
				Math.floor((dt - new Date(t_start)) / 1000 / 60 / 60),
				wthr.length - 1
			);
			if (Math.abs(wthr[hour].date - dt) < 60 * 60 * 1000) {
				return wthr[hour];
			} else if (wthr[hour].date - dt > 0) {
				// walk down the list until you're within an hour
				var i = 1;
				while (hour - i > 0 && Math.abs(wthr[hour - i].date - dt) > 60 * 1000) i += 1;
				return wthr[hour - i];
			} else {
				// walk up the list
				var i = 1;
				while (hour + i < wthr.length - 1 && Math.abs(wthr[hour + i].date - dt) > 60 * 1000) i += 1;
				return wthr[hour + i];
			}
		}

		var temperature = rides.dimension(function (e) { return e.weather.temperature; }),
				precipitation = rides.dimension(function (e) { return e.weather.precipitation; }),
				humidity = rides.dimension(function (e) { return e.weather.humidity; });

		var temperatures = temperature.group(function (t) { return Math.floor(t / 2); }),
				precipitations = precipitation.group(function (p) { return Math.floor(p / 5); }),
				humidities = humidity.group(function (p) { return Math.floor(p / 5); });

		scatter_charts[0]
			.dimension(start_station)
			.group(start_stations);

		ride_charts = [
			barChart()
				.dimension(hour)
				.group(hours)
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
					.rangeRound([0, 10 * 24]))
				.barWidth(16)
				.tickFormat(function (e) { return e.getDay() % 2 ? daysOfWeek[e.getDay()] : ''; }),

			barChart()
				.dimension(duration)
				.group(durations)
				// .round(Math.floor)
				.x(d3.scale.linear()
					.domain([0, 30])
					.rangeRound([0, 10 * 24]))
				.barWidth(7)
				.tickFormat(function (e) { return e * 5; })
				.brushToValues(function (e) { return e * 5; }),

			categoricalChart()
				.dimension(subscribed)
				.group(subscriptions)
				.x(d3.scale.ordinal()
					.domain([true, false])
					.rangePoints([0, 10 * 5], 1))
				.tickFormat(function (e) { return e ? 'Y' : 'N'; })
		];

		weather_charts = [
			barChart()
				.dimension(temperature)
				.group(temperatures)
				.x(d3.scale.linear()
					.domain([0, 20])
					.rangeRound([0, 10 * 20]))
				.tickFormat(function (e) { return e % 4 == 0 ? e * 2 : ''; })
				.brushToValues(function (e) { return e * 2; }),

			barChart()
				.dimension(humidity)
				.group(humidities)
				.x(d3.scale.linear()
					.domain([0, 20])
					.rangeRound([0, 10 * 20]))
				.tickFormat(function (e) { return e % 4 == 0 ? e * 5 : ''; })
				.brushToValues(function (e) { return e * 5; }),
		];
		
		ride_chart = d3.selectAll('#bike-ride-charts .crossfilter-chart')
			.data(ride_charts)
			.each(function (chart) {
				chart.on('brush', renderAll).on('brushend', renderAll);
			});

		weather_chart = d3.selectAll('#weather-charts .crossfilter-chart')
			.data(weather_charts)
			.each(function (chart) {
				chart.on('brush', renderAll).on('brushend', renderAll);
			})

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
		var date = photos.dimension(function (e) { return e.date; }),
				hour = photos.dimension(function (e) { return e.date.getHours() + e.date.getMinutes() / 60; }),
				hex = photos.dimension(function (e) { return [e.id, {lng: e.lng, lat: e.lat}]; });
		var dates = date.group(d3.time.day),
				hours = hour.group(Math.floor),
				hexes = hex.group();

		ride_charts[0].dimension(hour).brushCallback(rerenderHexbins);
		ride_charts[1].dimension(date).brushCallback(rerenderHexbins);

		var g = d3.select(scatter_elt)
			.insert('g', ':first-child')
			.attr('class', 'hexbin-0')
			.attr('width', scatter_width)
			.attr('height', scatter_height);

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
			var hexbins = hexbin(hex.top(Infinity));
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
			rerenderHexbins();
			// if you want to do something on zoom
			// .each(function (d) {
			// 	var elt = d3.select(this);
			// 	elt.attr('transform', elt.attr('transform') + 'scale(0.5)');
			// });
		}

		function rerenderHexbins () {
			hexagons = g.selectAll('path')
				.data(computeHexbins(), function (d) { return d.i + "," + d.j; });
			hexagons
				.style('opacity', function (d) {
					return 0.1, Math.min(d.length / 100, 1);
				});
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

		zoom.on('zoom.subwayStations', function () {
			stations.attr('transform', transform);
		});

		var semanticZoom = Math.sqrt;

		function transform (d) {
			var coords = [d.lng, d.lat];
			var scaling = d3.event ? semanticZoom(d3.event.scale) : zoom.scaleExtent()[0];
			return 'translate(' + xScatter(coords[0]) + ',' + yScatter(coords[1]) + ')scale(' + scaling + ')';
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
			.attr('r', function (d) { return 7 / Math.pow(d.rank, 0.5); })
			.style('fill', '#FF5252')
			.attr('transform', transform);

		zoom.on('zoom.locations', function () {
			locations.attr('transform', transform);
		});

		var semanticZoom = function (x) { return Math.pow(x, 1/3); };

		function transform (d) {
			var coords = [d.lng, d.lat];
			var scaling = d3.event ? semanticZoom(d3.event.scale) : zoom.scaleExtent()[0];
			return 'translate(' + xScatter(coords[0]) + ',' + yScatter(coords[1]) + ')scale(' + scaling + ')';
		}
	});
});


function container () {
	// use heatmaps to visualize the results of the PageRank algorithm
	// maybe do that thing where we have the layers stacked in 3d space

	var heatmap = h337.create({
		radius: 20,
		blur: 1,
		maxOpacity: 0.9,
		minOpacity: 0.3,
		useLocalExtrema: true,
		gradient: {
			0       : '#eee',
			0.2     : '#eee',
			0.20001 : '#bbb',
			0.4     : '#bbb',
			0.40001 : '#888',
			0.6     : '#888',
			0.60001 : '#444',
			0.8     : '#444',
			0.80001 : '#111',
			1       : '#111'
		},
		container: d3.select('#scatterplot #heatmap-container')[0][0]
	});

	heatmap.setData({
		min: 0,
		max: 1,
		data: data.data.map(function (d) {
			return {x: xScatter(d.lng), y: yScatter(d.lat), value: 1};
		})
	});

}

