
angular.module('mapApp', ['mapApp.factories', 'ngMaterial'])

.controller('MainController', function ($scope, $rootScope, $q, bikeRides, stationData, bikeDirections) {
	return 0;
})

.controller('MapController', function ($scope, $timeout, $rootScope, $q, bikeRides, stationData, bikeDirections) {
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
	var simple_grey = L.tileLayer('http://127.0.0.1:8080/simple_grey/{z}/{x}/{y}.png');
	var simple = L.tileLayer('http://127.0.0.1:8080/simple/{z}/{x}/{y}.png');
	var muted = L.tileLayer('http://127.0.0.1:8080/muted/{z}/{x}/{y}.png');

	var map = L.map('map', {
		center: [center.lat, center.lng],
		zoom: center.zoom,
		minZoom: minZoom,
		maxZoom: maxZoom,
		bounceAtZoomLimits: true,
		attributionControl: false,
		maxBounds: bounds,
		layers: [
			simple_grey,
			simple,
			muted
		]
	});

	var station_paths_layer = L.geoJson([], {
		style: {
			color: '#33CC33',
			weight: 3,
			clickable: true,
			className: 'station-path'
		}
	}).on('click', function () {
		console.log('clicked geojson');
	}).addTo(map);

	var tile_layers = {
		'Simple (Greyscale)': simple_grey,
		'Simple': simple,
		'Muted': muted
	};

	var overlays = {};

	L.control.layers(tile_layers, overlays).addTo(map);

	// initialize d3
	map._initPathRoot()
	var svg = d3.select('#map').select("svg");
	var g = svg.append("g");

	// put the stations on
	var station1 = null;
	var station2 = null;
	stationData.get().then(function (data) {
		data.features.forEach(function (e) {
			e.latLng = new L.latLng(e.geometry.coordinates[1], e.geometry.coordinates[0]);
		});

		var feature = g.selectAll('circle')
			.data(data.features)
			// .enter().append('a')
			// .classed('tooltip', true).classed('station-tooltip', true)
			// .attr('title', function (e) { return e.properties.name; })
			.enter().append('circle')
			.attr('r', 0)
			.classed('station-marker', true)
			.on('click', clickedStation)
			.attr('name', function (e) { return e.properties.name; });

		$('svg circle.station-marker').tipsy({
			gravity: 's',
			html: true,
			title: function () {
				return this.__data__.properties.name;
			}
		});
		// class for styling is tipsy tipsy-s

		feature
			.transition()
			.delay(function () {
				return Math.random() * 200 + 100;
			})
			.duration(150)
			.attr('r', 5);

		map.on("viewreset", update);
		update();

		function update () {
			feature.attr('transform', function (e) {
				return "translate(" +
					map.latLngToLayerPoint(e.latLng).x + "," + 
					map.latLngToLayerPoint(e.latLng).y + ")";
			});
		}

		function clickedStation (e) {
			d3.select(this).classed('station-clicked', true);
			console.log(d3.select(this).attr('name'));
			if (station1 === null) {
				station1 = e.id;
				// d3.selectAll('.station-clicked').classed('station-clicked', false);
				// d3.select('#marker_' + station1).classed('station-clicked', true);
			} else {
				station2 = e.id;
				bikeDirections.get(station1, station2).then(function (data) {
					station_paths_layer.clearLayers().addData(data);
					station1 = null;
					station2 = null;
				});
			}
		}
	});

	function deselectStations () {
		d3.selectAll('.station-clicked').classed('station-clicked', false);
		station1 = null;
		station2 = null;
		station_paths_layer.clearLayers();
	};

	map.on('click', function (e) {
		if (e.originalEvent.srcElement.nodeName != 'circle') {
			deselectStations();
		}
	});

	map.on('click', function (e) {
		// console.log(e);
	});

	map.on('zoomend', function (e) {
		console.log(e);
	});

});
