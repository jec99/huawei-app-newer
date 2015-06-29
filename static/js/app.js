
var mapApp = angular.module('mapApp', ['leaflet-directive']);

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

mapApp.controller('MainController', function ($scope, stationData) {
	$scope.text = 'HELLO THIS APP HEDHOG CUTE';

	var style = function (feature) {
		return {
			color: '#000',
			opacity: 1,
			fillColor: '#FF6600',
			fillOpacity: 0.8,
			weight: 1,
			radius: 6,
			clickable: true
		}
	};

	stationData.get().then(function (data) {
		$scope.geojson = data.features[0];
		$scope.stations = {
			data: data,
			pointToLayer: function (feature, latlng) {
				return new L.circleMarker(latlng, style(feature));
			}
		}
	});

	angular.extend($scope, {
		tiles: {
			name: 'local',
			url: 'http://127.0.0.1:8080/main/{z}/{x}/{y}.png',
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

	$scope.$on('leafletDirectiveGeoJson.click', function (ev, leafletPayload) {
		console.log(leafletPayload.model.properties.name);
	});

});

