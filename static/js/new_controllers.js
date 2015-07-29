
var day_abbr = ['Su', 'M', 'T', 'W', 'Th', 'F', 'S'];

angular.module('mapApp.newControllers', [])

.controller('NewController', function ($scope, $q, subwayStationsFactory,
		stationsFactory, photosFactory, ridesFactory, pointsOfInterestFactory,
		weatherFactory) {

	var t_start = '2012-06-01 00:00:00',
			t_end = '2012-06-15 00:00:00';
	var map_center = [-77.034136, 38.96],
			map_radius = 0.25;

	var scatter_width = 500,
			scatter_height = 500,
			map_width = 500,
			map_height = 500;

	var scatter_charts,
			ride_charts,
			weather_charts,
			scatter_chart_selection,
			ride_chart_selection,
			weather_chart_selection;

	var projection = d3.geo.mercator()
		.scale((1 << 19) / 2 / Math.PI)
		.translate([-map_width / 2, -map_height / 2]);
	var scale0 = projection.scale() * 2 * Math.PI;

	// linear approximations to the Mercator projection, local to DC
	var x_projection = d3.scale.linear()
				.domain([map_center[0] - map_radius, map_center[0] + map_radius])
				.range([
					projection([map_center[0] - map_radius, map_center[1]])[0],
					projection([map_center[0] + map_radius, map_center[1]])[0]
				]),
			y_projection = d3.scale.linear()
				.domain([map_center[1] - map_radius, map_center[1] + map_radius])
				.range([
					projection([map_center[0], map_center[1] - map_radius])[1],
					projection([map_center[0], map_center[1] + map_radius])[1]
				]),
			x_orig = x_projection.copy(),
			y_orig = y_projection.copy();

	var tile = d3.geo.tile()
				.size([map_width, map_height]),
			tile_projection = d3.geo.mercator(),
			tile_path = d3.geo.path()
				.projection(tile_projection);

	var zoom = d3.behavior.zoom()
		.scale(scale0)
		.scaleExtent([1 << 18, 1 << 23])
		.translate(projection(map_center).map(function (x) { return -x; }))
		.on('zoom.main', zoomed)

	var tile_map = d3.select('#charts-container .map-container').append('div')
		.attr('class', 'map')
		.style('width', map_width + 'px')
		.style('height', map_height + 'px')
		.call(zoom);

	var base_layer = tile_map.append('div')
		.attr('class', 'layer');

	zoomed();

	function zoomed () {
		update_projection();
		update_linear_projection();
		update_tiles();
	}

	function update_projection () {
		projection
			.scale(zoom.scale() / 2 / Math.PI)
			.translate(zoom.translate());
	}

	function update_linear_projection () {
		x_projection.range([
			projection([map_center[0] - map_radius, map_center[1]])[0],
			projection([map_center[0] + map_radius, map_center[1]])[0]
		]);

		y_projection.range([
			projection([map_center[0], map_center[1] - map_radius])[1],
			projection([map_center[0], map_center[1] + map_radius])[1]
		]);
	}

	function update_tiles () {
		var tiles = tile
			.scale(zoom.scale())
			.translate(zoom.translate())();

		var image = base_layer
			.style('-webkit-transform', matrix3d(tiles.scale, tiles.translate))
			.selectAll('.tile')
			.data(tiles, function (d) { return d; });

		image.exit()
			.each(function (d) { this._xhr.abort(); })
			.remove();

		image.enter().append('svg')
			.attr('class', 'tile')
			.style('left', function (d) { return d[0] * 256 + 'px'; })
			.style('top', function (d) { return d[1] * 256 + 'px'; })
			.each(function (d) {
				var svg = d3.select(this);

				// TODO: refactor into a service
				this._xhr = d3.json('http://' + ['a', 'b', 'c'][(d[0] * 31 + d[1]) % 3] + '.tile.openstreetmap.us/vectiles-highroad/' + d[2] + '/' + d[0] + '/' + d[1] + '.json', function (error, json) {
					var k = Math.pow(2, d[2]) * 256; // size of the world in pixels

					tile_path.projection()
							.translate([k / 2 - d[0] * 256, k / 2 - d[1] * 256]) // [0°,0°] in pixels
							.scale(k / 2 / Math.PI);

					svg.selectAll('path')
							.data(json.features.sort(function (a, b) { return a.properties.sort_key - b.properties.sort_key; }))
						.enter().append('path')
							.attr('class', function (d) { return d.properties.kind; })
							.attr('d', tile_path);
				});
			});
	}

	function matrix3d (scale, translate) {
		var k = scale / 256,
				r = scale % 1 ? Number : Math.round;
		return "matrix3d(" + [k, 0, 0, 0, 0, k, 0, 0, 0, 0, k, 0, r(translate[0] * scale), r(translate[1] * scale), 0, 1 ] + ")";
	}

	function transform2d (scale, translate) {
		return 'translate(' + translate + ')scale(' + scale + ')';
	}

	// scatterplot initiation
	var scatter_elt = '#charts-container #scatterplot > svg';
	d3.select(scatter_elt)
		.call(zoom)
		.attr('width', scatter_width)
		.attr('height', scatter_height);

	function render (method) {
		d3.select(this).call(method);
	}

	function render_all () {
		ride_chart_selection.each(render);
		weather_chart_selection.each(render);
		scatter_chart_selection.each(function (sc) { render(sc.rerender); });
	}

	stationsFactory.get().then(function (data) {
		var stations = [];
		for (var i = 0; i < data.data.length; i++) {
			var x = data.data[i];
			stations.push({ id: x.id, lng: x.lng, lat: x.lat });			
		}

		var colors = d3.scale.cubehelix()
			.domain([0, 0.5, 1])
			.range([d3.hsl(240, .6, .3), d3.hsl(60, .6, 1), d3.hsl(-40, .6, .3)]);

		var get_color = function (x) {
			return colors(Math.pow((x + 1) / 2, 2));
		};

		scatter_charts = [
			scatterPlot()
				.width(scatter_width)
				.height(scatter_height)
				.x(x_projection)
				.y(y_projection)
				.zoom(zoom)
				.semanticZoom(function (s) { return 1; })
				.points(stations)
				.coordinates(function (d) { return [d.lng, d.lat]; })
				.relativeComparator(function (v) {
					return v.subscribed - v.casual;
				})
				.r(function (v) {
					if (v === undefined) return 1;
					return Math.max(Math.pow(v.casual + v.subscribed, 1 / 2), 3) / 2;
				})
				.opacity(function () { return 0.8; })
				.color(function (v) {
					if (v === undefined) return get_color(0.5);
					return get_color((v.subscribed - v.casual) / (v.subscribed + v.casual));
				})
		]

		scatter_chart_selection = d3.select(scatter_elt)
			.data(scatter_charts)
			.each(render);

		return subwayStationsFactory.get();
	}).then(function (data) {
		var semanticZoom = Math.sqrt;

		var subway_stations_layer = tile_map.append('div')
					.attr('class', 'layer')
					.attr('id', 'subway-stations-layer'),
				g = subway_stations_layer.append('svg')
					.attr('width', map_width)
					.attr('height', map_height)
					.append('g');

		var circles = g.selectAll('circle')
			.data(data.data)
			.enter().append('circle')
			.attr('r', 3)
			.style('fill', '#536DFE')
			.attr('transform', transform);

		zoom.on('zoom.subway_stations', function () {
			circles.attr('transform', transform);
		});

		function transform (d) {
			var translate = [x_projection(d.lng), y_projection(d.lat)];
			var scale = d3.event ? zoom.scale() : scale0;
			scale = semanticZoom(scale / scale0);
			return transform2d(scale, translate);
		}

		return pointsOfInterestFactory.get();
	}).then(function (data) {
		var semanticZoom = Math.sqrt;

		var points_of_interest_layer = tile_map.append('div')
					.attr('class', 'layer')
					.attr('id', 'pois-layer'),
				g = points_of_interest_layer.append('svg')
					.attr('width', map_width)
					.attr('height', map_height)
					.append('g');

		var circles = g.selectAll('circle')
			.data(data.data)
			.enter().append('circle')
			.attr('r', function (d) { return 7 / Math.pow(d.rank, 0.5); })
			.style('fill', '#FF5252')
			.attr('transform', transform);

		zoom.on('zoom.locations', function () {
			circles.attr('transform', transform);
		});

		function transform (d) {
			var translate = [x_projection(d.lng), y_projection(d.lat)];
			var scale = d3.event ? zoom.scale() : scale0;
			scale = semanticZoom(scale / scale0);
			return transform2d(scale, translate);
		}

		return $q.all([
			ridesFactory.get(t_start, t_end),
			weatherFactory.get(t_start, t_end)
		]);
	}).then(function (data) {
		var rds = data[0].data,
				wthr = data[1].data;

		wthr.forEach(function (e) { e.date = new Date(e.date); });

		function getWeather (dt) {
			var hour = Math.min(
				Math.floor((dt - new Date(t_start)) / 1000 / 60 / 60),
				wthr.length - 1
			);
			if (Math.abs(wthr[hour].date - dt) < 60 * 60 * 1000) {
				return wthr[hour];
			} else if (wthr[hour].date - dt > 0) {
				var i = 1;
				while (hour - i > 0 && Math.abs(wthr[hour - i].date - dt) > 60 * 1000) i += 1;
				return wthr[hour - i];
			} else {
				var i = 1;
				while (hour + i < wthr.length - 1 && Math.abs(wthr[hour + i].date - dt) > 60 * 1000) i += 1;
				return wthr[hour + i];
			}
		}

		rds.forEach(function (e) {
			e.date = new Date(e.date);
			e.weather = getWeather(e.date);
		});

		var rides = crossfilter(rds);

		var date = rides.dimension(function (e) { return e.date; }),
				hour = rides.dimension(function (e) { return e.date.getHours() + e.date.getMinutes() / 60; }),
				duration = rides.dimension(function (e) { return e.duration / 60; }),
				subscribed = rides.dimension(function (e) { return e.subscribed; }),
				start_station = rides.dimension(function (e) { return e.start_id; }),
				temperature = rides.dimension(function (e) { return e.weather.temperature; }),
				humidity = rides.dimension(function (e) { return e.weather.humidity; });

		var dates = date.group(d3.time.day),
				hours = hour.group(Math.floor),
				durations = duration.group(function (e) { return Math.floor(e / 5); }),
				subscriptions = subscribed.group(),
				start_stations = start_station.group()
				temperatures = temperature.group(function (t) { return Math.floor(t / 2); }),
				humidities = humidity.group(function (h) { return Math.floor(h / 5); });

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
				.tickFormat(function (e) { return e.getDay() % 2 ? day_abbr[e.getDay()] : ''; }),

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

		ride_chart_selection = d3.selectAll('#charts-container #bike-ride-charts .crossfilter-chart')
			.data(ride_charts)
			.each(function (chart) {
				chart.on('brush', render_all).on('brushend', render_all);
			});

		weather_chart_selection = d3.selectAll('#charts-container #weather-charts .crossfilter-chart')
			.data(weather_charts)
			.each(function (chart) {
				chart.on('brush', render_all).on('brushend', render_all);
			});

		render_all();

		return photosFactory.get(t_start, t_end);
	}).then(function (data) {
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

		
		
	});

})

