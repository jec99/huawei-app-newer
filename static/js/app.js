
var mapApp = angular.module('mapApp', ['leaflet-directive', 'ngMaterial', 'gridshore.c3js.chart']);

mapApp.factory('stationData', function ($q, $http) {
	var geoJSON;
	return {
		get: function () {
			var deferred = $q.defer();
			if (!geoJSON) {
				$http.get('/station_data'
				).success(function (data, status, headers, response) {
					geoJSON = data;
					deferred.resolve(data);
				}).error(function (data, status, headers, response) {
					deferred.reject(status);
				});
			} else {
				deferred.resolve(geoJSON);
			}

			return deferred.promise;
		}
	};
});

mapApp.factory('bikeRides', function ($q, $http) {
	return {
		get: function (x, y) {
			// takes in station id x, station id y
			var deferred = $q.defer();
			$http.get('/rides/' + x + '/' + y
			).success(function (data, status, headers, response) {
				deferred.resolve(data);
			}).error(function (data, status, headers, response) {
				deferred.reject(status);
			});

			return deferred.promise;
		}
	};
});

mapApp.factory('bikeRidesSummary', function ($q, $http, $timeout) {
	var rideData = null;
	var oldX;
	var oldY;

	return {
		get: function (x, y) {
			var deferred = $q.defer();
			if (x == oldX && y == oldY && rideData !== null) {
				$timeout(function () {
					deferred.resolve(rideData);
				}, 20);
			} else {
				dataUrl = '/rides_summary' + (x && y ? '/' + x + '/' + y : '');
				$http.get(dataUrl
				).success(function (data, status, headers, response) {
					oldX = x;
					olyY = y;
					rideData = data;
					deferred.resolve(data);
				}).error(function (data, status, headers, response) {
					deferred.reject(status);
				});
			}

			return deferred.promise;
		}
	};
});

mapApp.factory('bikeDirections', function ($q, $http) {
	return {
		get: function (x, y) {
			// takes in station id x, station id y
			var deferred = $q.defer();
			$http.get('/bike_station_route/' + x + '/' + y
			).success(function (data, status, headers, response) {
				deferred.resolve(data);
			}).error(function (data, status, headers, response) {
				deferred.reject(status);
			});

			return deferred.promise;
		}
	}
});

mapApp.controller('MainController', function ($scope, $rootScope, $q, bikeRides, stationData, bikeDirections, leafletEvents) {
	stationData.get().then(function (data) {
		$scope.stations = {};
		for (var i = 0; i < data.features.length; i++) {
			var feature = data.features[i];
			$scope.stations[feature.id] = {	
				lng: feature.geometry.coordinates[0],
				lat: feature.geometry.coordinates[1],
				properties: feature.properties,
				id: feature.id,
				focus: false,
				clicked: true,
				icon: {
					type: 'div',
					className: 'marker-default',
					iconSize: null,
					html:
						'<a class="tooltip station-tooltip" title="' + feature.properties.name + '">' +
						'<div class="icon-container" id="marker_' + feature.id + '"></div>' +
						'</a>'
				}
			}
		};
		return data;
	});

	angular.extend($scope, {
		route: {},
		layers: {
			baselayers: {
				simple: {
					name: "Simple",
					url: 'http://127.0.0.1:8080/simple/{z}/{x}/{y}.png',
					type: 'xyz'
				},
				muted: {
					name: "Muted",
					url: 'http://127.0.0.1:8080/muted/{z}/{x}/{y}.png',
					type: 'xyz'
				}
			}
		},
		maxbounds: {
			northEast: {
				lat: 39.6268,
				lng: -76.0597
			},
			southWest: {
				lat: 38.5439,
				lng: -77.5896
			}
		},
		dc: {
			lat: 38.888928,
			lng: -77.034136,
			zoom: 12
		},
		defaults: {
			maxZoom: 16,
			minZoom: 10
		}
	});

	var selectedPath = false;
	var station1 = null;
	$scope.$on('leafletDirectiveMarker.click', function (ev, payload) {
		if (station1 === null) {
			station1 = payload.model.id;
			$scope.route = {};

			// <BAD BAD BAD BAD BAD>
			// the reason this is here is because angular-leaflet doesn't
			// $compile the html in the markers, meaning we can't easily change
			// classes on click...kind of an oversight. i opened an issue
			d3.selectAll('.station-clicked').classed('station-clicked', false);
			d3.select('#marker_' + station1).classed('station-clicked', true);
			// /<BAD BAD BAD BAD BAD>
		} else {
			var station2 = payload.model.id;
			$rootScope.$emit('station_path', [station1, station2]);

			// <BAD>
			d3.select('#marker_' + station2).classed('station-clicked', true);
			// </BAD>

			bikeDirections.get(station1, station2).then(function (data) {
				$scope.route = {
					p1: {
						color: '#33CC33',
						weight: 3,
						// message: duration,
						latlngs: data.coordinates.map(function (e) {
							return { lat: e[1], lng: e[0] };
						})
					}
				};

				// not working right now, nothing gets appended
				/*
				if (!selectedPath) {
					var svg = d3.select('svg');
					var defs = svg.append('defs');
					defs.append('filter')
						.attr("id", "glow")
						.attr("stdDeviation", 50)
						.attr("in", "SourceGraphic");
					svg.select('path').attr("filter", "url(#glow)");
					selectedPath = true;
				}
				*/

				return 1;
			}).then(function (data) {
				station1 = null;
			});
		}
	});

	$scope.$on('leafletDirectiveMap.zoomend', function (ev, payload) {
		console.log('zoom level: ' + payload.leafletObject._zoom);
	});

	$scope.$on('leafletDirectiveMap.baselayerchange', function (ev, payload) {
		console.log('new layer: ' + payload.leafletEvent.name);
	});

	$scope.$on('leafletDirectiveMap.click', function (ev, payload) {
		d3.selectAll('.station-clicked').classed('station-clicked', false);
		station1 = null;
		$scope.route = {};
	});
});


mapApp.controller('ChartsController', function ($scope, $rootScope, bikeRidesSummary) {
	$scope.day_by_hour = {
		cols: [
			{ id: "hour_sub", type: "line", name: "Hour: Subscribed", color: "blue" },
			{ id: "hour_cas", type: "line", name: "Hour: Casual", color: "red" },
			{ id: "hour_total", type: "line", name: "Hour: Total", color: "purple" }
		],
		axis: { id: "x" },
		data: [
			{ x: 10, hour_sub: 10, hour_cas: 10, hour_total: 15 },
			{ x: 20, hour_sub: 100, hour_cas: 90, hour_total: 60 },
			{ x: 30, hour_sub: 15, hour_cas: 30, hour_total: 70 },
			{ x: 40, hour_sub: 50, hour_cas: 40, hour_total: 15 }
		]
	};

	$scope.week_by_day = {
		cols: [
			{ id: "day_sub", type: "line", name: "Day: Subscribed", color: "blue" },
			{ id: "day_cas", type: "line", name: "Day: Casual", color: "red" },
			{ id: "day_total", type: "line", name: "Day: Total", color: "purple" }
		],
		axis: { id: "x" },
		data: [
			{ x: 10, day_sub: 10, day_cas: 10, day_total: 15 },
			{ x: 20, day_sub: 100, day_cas: 90, day_total: 60 },
			{ x: 30, day_sub: 15, day_cas: 30, day_total: 70 },
			{ x: 40, day_sub: 50, day_cas: 40, day_total: 15 }
		]
	};

	$scope.year_by_week = {
		cols: [
			{ id: "week_sub", type: "line", name: "Week: Subscribed", color: "blue" },
			{ id: "week_cas", type: "line", name: "Week: Casual", color: "red" },
			{ id: "week_total", type: "line", name: "Week: Total", color: "purple" }
		],
		axis: { id: "x" },
		data: [
			{ x: 10, week_sub: 10, week_cas: 10, week_total: 15 },
			{ x: 20, week_sub: 100, week_cas: 90, week_total: 60 },
			{ x: 30, week_sub: 15, week_cas: 30, week_total: 70 },
			{ x: 40, week_sub: 50, week_cas: 40, week_total: 15 }
		]
	};

	$rootScope.$on('station_path', function (event, payload) {
		bikeRidesSummary.get(payload[0], payload[1]).then(function (data) {
			var data_scope = [];
			for (var i = 0; i < 24; i++) {
				data_scope.push({
					x: i,
					hour_sub: data.day_by_hour.subscribed[i],
					hour_cas: data.day_by_hour.casual[i],
					hour_total: data.day_by_hour.total[i],
				});
			}
			$scope.day_by_hour.data = data_scope;

			data_scope = [];
			for (var i = 0; i < 7; i++) {
				data_scope.push({
					x: i,
					day_sub: data.week_by_day.subscribed[i],
					day_cas: data.week_by_day.casual[i],
					day_total: data.week_by_day.total[i],
				});
			}
			$scope.week_by_day.data = data_scope;

			data_scope = [];
			for (var i = 0; i < 52; i++) {
				data_scope.push({
					x: i,
					week_sub: data.year_by_week.subscribed[i],
					week_cas: data.year_by_week.casual[i],
					week_total: data.year_by_week.total[i],
				});
			}
			$scope.year_by_week.data = data_scope;
		});
	});
	
});


mapApp.controller('GraphController', function ($scope) {
	var width = 800,
			height = 800;
	var svg = d3.select('#network-viz-1')
		.attr('width', width)
		.attr('height', height);

	function layoutGraph (g) {
		// no edges for now

		var weight_f = function (d) { return d.weight; };
		var size_f = function (d) { return d.size; };
		var minWeight = d3.min(g.edges, weight_f);
		var maxWeight = d3.max(g.edges, weight_f);
		var edgeRamp = d3.scale.linear().domain([minWeight, maxWeight]).range([.5,4]).clamp(true);
		var minSize = d3.min(g.nodes, size_f);
		var maxSize = d3.max(g.nodes, size_f);
		var sizingRamp = d3.scale.linear().domain([minSize, maxSize]).range([1, 10]).clamp(true);

		var minX = d3.min(g.nodes, function (d) { return d.lng; });
		var maxX = d3.max(g.nodes, function (d) { return d.lng; });
		var minY = d3.min(g.nodes, function (d) { return d.lat; });
		var maxY = d3.max(g.nodes, function (d) { return d.lat; });

		var heightRamp = d3.scale.linear().domain([minY, maxY]).range([height - 50, 50]).clamp(true);
		var widthRamp = d3.scale.linear().domain([minX, maxX]).range([50, width - 50]).clamp(true);

		svg.selectAll(".line")
			.data(g.edges)
			.enter()
			.append("svg:line")
			.attr("x1", function (d) { return widthRamp(d.source.lng); })
			.attr("y1", function (d) { return heightRamp(d.source.lat); })
			.attr("x2", function (d) { return widthRamp(d.target.lng); })
			.attr("y2", function (d) { return heightRamp(d.target.lat); })
			.attr('class', 'edge')
			.style("stroke-width", function (d) { return edgeRamp(d.weight); });

		svg.selectAll('circle.node')
			.data(g.nodes)
			.enter()
			.append('svg:circle')
			.attr('cx', function (d) { return widthRamp(d.lng); })
			.attr('cy', function (d) { return heightRamp(d.lat); })
			.attr('r', function (d) { return sizingRamp(d.size); })
			.attr('class', 'node');
	};

	function randomGraph (n, p) {
		// erdos-renyi
		var graph = {nodes: [], edges: []};
		for (var i = 0; i < n; i++) {
			var lat = Math.random();
			var lng = Math.random();
			var size = Math.random()
			var newNode = {id: i, lat: lat, lng: lng, size: size};
			graph.nodes.push(newNode);
			for (var j = 0; j < n; j++) {
				if (j < i && Math.random() < p) {
					var weight = Math.random();
					newLink = {source: graph.nodes[i], target: graph.nodes[j], weight: weight};
					graph.edges.push(newLink);
				}
			}
		}
		return graph;
	};

	layoutGraph(randomGraph(10, 0.35));

});


