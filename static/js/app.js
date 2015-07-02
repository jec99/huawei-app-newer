
var mapApp = angular.module('mapApp', ['leaflet-directive', 'ngMaterial']);

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

mapApp.controller('MainController', function ($scope, stationData, bikeDirections, leafletEvents) {

	var x_station = [-76.998347, 38.899972];
	var y_station = [-77.0512, 38.8561];

	$scope.stations = {};
	stationData.get().then(function (data) {
		// adding a bunch of markers for the stations, as opposed to geojson
		var feature;
		for (var i = 0; i < data.features.length; i++) {
			feature = data.features[i];
			$scope.stations[feature.id] = {
				lng: feature.geometry.coordinates[0],
				lat: feature.geometry.coordinates[1],
				properties: feature.properties,
				id: feature.id,
				focus: false,
				resetStyleOnMouseout: true,
				// message: 'hi this is a popup',
					// message can be text or an angular template
				// popupAnchor:  [0, 0],
				// popupOptions: {
				// 	className: 'popup'
				// },
				icon: {
					type: 'div',
					className: 'marker-default',
					iconSize: null,
          html: '<div class="icon-container">B</div>'
				}
			}
		}

		return data;
	}).then(function (data) {
		// this is just a sample, obviously
		var x_station = data.features[0].id;
		var y_station = data.features[1].id;
		bikeDirections.get(x_station, y_station).then(function (data) {
			$scope.directions = data;
			console.log(data);
			console.log('yeah');
		}, function () {
			console.log(':(');
		});
	});
	

	angular.extend($scope, {
		tiles: {
			name: 'local',
			url: 'http://127.0.0.1:8080/simple/{z}/{x}/{y}.png',
			type: 'xyz',
			options: {
				attribution: ''
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
			lat: 39.1130,
			lng: -76.8123,
			zoom: 12
		},
		defaults: {
			maxZoom: 16,
			minZoom: 10
		}
	});

	$scope.$on('leafletDirectiveGeoJson.click', function (ev, payload) {
		console.log(payload.model.properties.name);
	});

	$scope.$on('leafletDirectiveMarker.click', function (ev, payload) {
		console.log('clicked: ' + payload.model.properties.name);
	});

	$scope.$on('leafletDirectiveMap.zoomend', function (ev, payload) {
		console.log('zoom level: ' + payload.leafletObject._zoom);
	});
});

