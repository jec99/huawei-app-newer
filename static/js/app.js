
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

mapApp.controller('MainController', function ($scope, sampleData) {
	$scope.text = 'Hello this is app';
	sampleData.getSampleData().then(function (data) {
		$scope.data = data;
	});
});
