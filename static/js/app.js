
angular.module('mapApp', ['mapApp.factories', 'ngMaterial'])

.controller('MainController', function ($scope, $rootScope, $q, bikeRides, stationData, bikeDirections) {
	return 0;
})

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

})

.controller('PhotosCrossfilterController', function ($scope, $timeout, photosFactory) {
	photosFactory.get('2012-06-01 00:00:00', '2012-07-01 00:00:00').then(function (data) {
		// for instant response times
		dc.constants.EVENT_DELAY = 35;

		var photos;
		var dateDimension;
		var dates;
		var hourDimension;
		var hours;
		var charts;

		data.data.forEach(function (e) {
			e.date = new Date(e.date);
		});
		photos = crossfilter(data.data);
		dateDimension = photos.dimension(function (e) { return e.date; });
		hourDimension = photos.dimension(function (e) { return e.date.getHours() + e.date.getMinutes() / 60; });
		dates = dateDimension.group(d3.time.day);
		hours = hourDimension.group(Math.floor);

		var firstDate = dateDimension.bottom(1)[0].date;
		var lastDate = dateDimension.top(1)[0].date;
		var daysDifference = (lastDate - firstDate) / 1000 / 60 / 60 / 24;

		console.log('before the charts');

		// this is coming from dc.js, a crossfilter charting library
		// if it turns out it's not enough to connect to d3 as well
		// as we want, we can just reimplement the crossfilter
		// example (only bar charts but the rest can be ported)
		var hourChart = dc.barChart('#photo-hour-chart')
			.width(480)
			.height(150)
			.margins({top: 10, right: 10, bottom: 20, left: 40})
			.dimension(hourDimension)
			.group(hours.reduceCount())
			// alternatively hours.reduceSum(function (t) {return f(t); })
			.transitionDuration(100)
			.centerBar(true)
			.gap(0)
			.x(d3.scale.linear()
				.domain([0, 24]))
				// .rangeRound([0, 10 * 24]))  maybe if needed
			.elasticY(false)
			.xAxis().tickFormat(function (v) { return v; });

		var dateChart = dc.barChart('#photo-date-chart')
			.width(640)
			.height(150)
			.margins({top: 10, right: 10, bottom: 20, left: 40})
			.dimension(dateDimension)
			.group(dates.reduceCount())
			.transitionDuration(100)
			.centerBar(true)
			.gap(-18.5)
			.x(d3.time.scale()
				.domain([firstDate, lastDate]))
			.elasticY(false)
			.xAxis().tickFormat(function (v) { return v.getMonth() + '-' + v.getDate(); });

		dc.renderAll();

		/* ***************

		// AN INTERLUDE ON CROSSFILTER

		photos.groupAll().reduceSum(function (e) { return e.val; }).value();
		var dateDimension = photos.dimension(function (e) { return e.date; });
		dateDimension.filter('2012-02-01 00:00:00');
		// now all operations are run on the filtered data
		photos.groupAll().reduceCount().value();
		// to clear the filters
		dateDimension.filterAll();
		var countMeasure = dateDimension.group().reduceSum(function () { return 1; });
		var a = countMeasure.top(countMeasure.size());
		// equivalent to countMeasure.all();
		// countMeasure now is an array of {key:, value:} objects,
		// key being name of group, value returned by the measure
		// what about filtering on ranges instead of specific values?
		dateDimension.filter([date1, date2]);
		dateDimension.filter(function (e) { return e.date == date1; });
		// removing filters is important, they are very expensive, and it's
		// not practical to have more than 8
		dateDimension.dispose();

		photos.add(data);  // adds data
		photos.remove();  // removes all records matching the current filter
		
		*************** */
	});

})

.controller('RidesCrossfilterController', function ($scope, $q, stationsFactory, ridesFactory) {
	var t_start = '2012-06-01 00:00:00';
	var t_end = '2012-06-02 00:00:00';
	var center = [-77.034136, 38.888928];
	var bounds = [[-77.2, 38.8], [-76.8, 39.1]];

	// if (false)
	// zoom's not working so i'm going to roll it myself
	$q.all([
		stationsFactory.get(),
		ridesFactory.get(t_start, t_end)
	]).then(function (data) {
		// reformat station data
		var stations = {};
		for (var i = 0; i < data[0].data.length; i++) {
			stations[i] = {
				lng: data[0].data[i].lng,
				lat: data[0].data[i].lat
			};
		}

		var rides = crossfilter(data[1].data);
		var ridesStartStation = rides.dimension(function (e) { return e.start_id; });
		var ridesGroup = ridesStartStation.group();

		var stationChart = dc.bubbleChart('#station-bubble-chart')
			.width(640)
			.height(640)
			.margins({top: 10, right: 50, bottom: 30, left: 40})
			.dimension(ridesStartStation)
			.group(ridesGroup)
			.transitionDuration(100)
			.colorAccessor(function (e) {
				return 'blue';
			})
			.keyAccessor(function (e) {
				return stations[e.key].lng;
				// return bounds[0][0];
			})
			.valueAccessor(function (e) {
				// simplest possible projection
				return stations[e.key].lat * Math.cos(center[1]);
				// return bounds[0][1];
			})
			.radiusValueAccessor(function (e) {
				// return Math.random() * 5;
				// return Math.min(e.value, 1);
				return 0.01 * e.value;
				// return 12;
			})
			// .maxBubbleRelativeSize(0.3)
			.x(d3.scale.linear().domain([bounds[0][0], bounds[1][0]]))
			.y(d3.scale.linear().domain([bounds[0][1] * Math.cos(center[1]), bounds[1][1] * Math.cos(center[1])]))
			.r(d3.scale.linear().domain([0, 15]))

			.elasticX(false)
			.elasticY(false)
			.xAxisPadding(100)
			.yAxisPadding(100)
			.renderHorizontalGridLines(true)
			.renderVerticalGridLines(true)
			.renderLabel(false)
			.mouseZoomable(true);

			dc.renderAll();
	});

});






