
angular.module('mapApp.mapController', [])

.controller('MapController', function ($scope, $timeout, $rootScope, $q, bikeRides, stationData, bikeDirections, bikeRideInterval, photosFactory) {
	var center = {
		lat: 38.888928,
		lng: -77.034136,
		zoom: 12
	};
	var minZoom = 10;
	var maxZoom = 16;
	var sw = L.latLng(38.5439, -77.5896);
	var ne = L.latLng(39.6268, -76.0597);
	var bounds = L.latLngBounds(sw, ne);
	var simple_grey = L.tileLayer('http://127.0.0.1:8080/simple_grey/{z}/{x}/{y}.png', {
		opacity: 0.8
	});
	var simple = L.tileLayer('http://127.0.0.1:8080/simple/{z}/{x}/{y}.png', {
		opacity: 0.8
	});
	var muted = L.tileLayer('http://127.0.0.1:8080/muted/{z}/{x}/{y}.png', {
		opacity: 0.8
	});

	var map = L.map('map', {
		center: [center.lat, center.lng],
		zoom: center.zoom,
		minZoom: minZoom,
		maxZoom: maxZoom,
		bounceAtZoomLimits: true,
		attributionControl: false,
		maxBounds: bounds,
	});

	var station_paths_layer = L.geoJson([], {
		style: {
			color: '#33CC33',
			weight: 3,
			clickable: true,
			className: 'station-path'
		}
	}).on('click', function () {
		console.log('clicked the path geojson layer');
	});

	var heatmap_layer = new HeatmapOverlay({
		radius: 30,
		maxOpacity: 1,
		scaleRadius: false,
		useLocalExtrema: false,
		latField: 'lat',
		lngField: 'lng',
		valueField: 'count',
		gradient: {
			'.5': 'blue',
			'.8': 'red',
			'.95': 'white'
		},
	});

	var cscale = d3.scale.linear().domain([0, 1]).range(['white', 'black']).interpolate(d3.interpolateLab);

	function hexbinStyle(hexagons) {
		hexagons
			.attr('stroke', 'black')
			.attr('fill', function (e) { return cscale(Math.random()); });
	}

	/* STATIONS */

	// initialize d3
	map._initPathRoot();
	var svg = d3.select('#map').select("svg");
	var g = svg.append("g");

	/* STATIONS */

	var hexbin_layer = L.hexbinLayer(null, {
		radius: 10,
		opacity: 1,
		clamp: false,
		style: hexbinStyle,
		mouseover: function () { },
		mouseout: function () { },
		click: function () { }
	}).addTo(map);

	map.addLayer(heatmap_layer);
	station_paths_layer.addTo(map);
	simple.addTo(map);
	simple_grey.addTo(map);
	muted.addTo(map);

	var tile_layers = {
		'Simple (Greyscale)': simple_grey,
		'Simple': simple,
		'Muted': muted
	};

	var overlays = {
		'Heatmap': heatmap_layer,
		'Hexbins': hexbin_layer
	};

	L.control.layers(tile_layers, overlays).addTo(map);

	/* STATIONS */

	// put the stations on
	var station1 = null;
	var station2 = null;
	stationData.get().then(function (data) {
		var feature = g.selectAll('circle')
			.data(data.features)
			.enter().append('circle')
			.attr('r', 0)
			.classed('station-marker', true)
			.on('click', clickedStation)
			.attr('name', function (e) { return e.properties.name; });

		/*
		// TOOLTIPS
		$('svg circle.station-marker').tipsy({
			gravity: 's',
			html: true,
			title: function () {
				return this.__data__.properties.name;
			}
		});
		*/

		feature
			.transition()
			.delay(function () {
				return Math.random() * 200 + 100;
			})
			.duration(150)
			.attr('r', 3);

		map.on("viewreset", update);
		update();

		function update () {
			feature.attr('transform', function (e) {
				var mapPoint = map.latLngToLayerPoint(new L.latLng(e.geometry.coordinates[1], e.geometry.coordinates[0]));
				return "translate(" + mapPoint.x + "," + mapPoint.y + ")";
			});
		}

		function clickedStation (e) {
			station_paths_layer.clearLayers()
			if (station1 === null) {
				station1 = e.id;
				d3.selectAll('.station-clicked').classed('station-clicked', false);

			} else {
				station2 = e.id;
				bikeDirections.get(station1, station2).then(function (data) {
					station_paths_layer.addData(data);
					station1 = null;
					station2 = null;
				});
			}
			d3.select(this).classed('station-clicked', true);
		}
	});

	function deselectStations () {
		d3.selectAll('.station-clicked').classed('station-clicked', false);
		station1 = null;
		station2 = null;
		station_paths_layer.clearLayers();
	}

	/* STATIONS */

	function values(o) {
		rets = [];
		for (var n in o) {
			rets.push(o[n]);
		}
		return rets
	}

	// put the heatmap on
	bikeRideInterval.get_counts('2012-06-01 00:00:00', '2012-06-02 00:00:00', '00:1:00:00', []).then(function (data) {
		var vals = values(data[12]);
		var max = Math.max.apply(null, vals.map(function (e) { return e['count']; }));
		heatmap_layer.setData({
			min: 0,
			max: max,
			data: values(data[12])
		});
	});

	// put the hexbins on
	bikeRideInterval.get_events_geojson('2012-06-01 00:00:00', '2012-06-02 00:00:00', '00:1:00:00', []).then(function (data) {
		var data_subset = data['data']['12'];
		hexbin_layer.setData(data_subset);
	});

	map.on('click', function (e) {
		if (e.originalEvent.srcElement.nodeName != 'circle') {
			deselectStations();
		}
	});

});