
var mapApp = angular.module('mapApp', []);

mapApp.factory('sampleData', function ($q, $http) {
	var weatherData;
	return {
		getSampleData: function () {
			var deferred = $q.defer();
			if (!weatherData) {
				$http.get('/data_sample'
				).success(function (data, status, headers, response) {
					weatherData = data;
					deferred.resolve(data);
				}).error(function (data, status, headers, response) {
					deferred.reject(status);
				});
			}

			return deferred.promise;
		}
	};
});

mapApp.factory('sampleGeoJSON', function ($q, $http) {
	var geoJSON;
	return {
		getGeoJSON: function () {
			var deferred = $q.defer();
			if (!geoJSON) {
				$http.get('/data_geojson'
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

mapApp.controller('MainController', function ($scope, sampleData, sampleGeoJSON) {
	$scope.text = 'Hello this is app';
	sampleData.getSampleData().then(function (data) {
		$scope.data = data;
	});
	sampleGeoJSON.getGeoJSON().then(function (data) {
		$scope.geojson = data;
	})
});
