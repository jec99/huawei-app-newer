
angular.module('mapApp.factories', [])

.factory('stationData', function ($q, $http) {
	var stations;
	return {
		get: function () {
			var deferred = $q.defer();
			if (stations) {
				$timeout(function () {
					deferred.resolve(stations);
				}, 20);
			} else {
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
})

.factory('bikeRides', function ($q, $http) {
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
})

.factory('bikeRidesSummary', function ($q, $http, $timeout) {
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
})

.factory('bikeDirections', function ($q, $http) {
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
})

.factory('bikeRideInterval', function ($q, $http, $timeout) {
	function get (t_start, t_end, t_interval, station, url) {
		// YYYY-mm-dd HH:MM:SS, --''--, dd:hh:mm:ss, [station id]
		var deferred = $q.defer();
		$http({
			url: url,
			method: 'GET',
			params: {
				t_start: t_start,
				t_end: t_end,
				t_interval: t_interval,
				station: station
			}
		}).success(function (data, status, headers, response) {
			deferred.resolve(data);
		}).error(function (data, status, headers, response) {
			deferred.reject(status);
		});

		return deferred.promise;
	}

	return {
		get_events: function (a, b, c, d) {
			return get(a, b, c, d, '/bike_rides_interval_events');
		},
		get_events_geojson: function (a, b, c, d) {
			return get(a, b, c, d, '/bike_rides_interval_events_geojson');
		},
		get_counts: function (a, b, c, d) {
			return get(a, b, c, d, '/bike_rides_interval_counts');
		}
	};
})

.factory('checkinsFactory', function ($q, $http) {
	return {
		get: function (start, end) {
			// YYYY-mm-dd HH:MM:SS
			var deferred = $q.defer();
			$http({
				method: 'GET',
				url: '/checkins',
				params: {
					t_start: start,
					t_end: end
				}
			}).success(function (data, status, headers, response) {
				deferred.resolve(data);
			}).error(function (data, status, headers, response) {
				deferred.reject(status);
			});

			return deferred.promise;
		}
	}
})

.factory('photosFactory', function ($q, $http) {
	return {
		get: function (start, end) {
			// YYYY-mm-dd HH:MM:SS
			var deferred = $q.defer();
			$http({
				method: 'GET',
				url: '/photos',
				params: {
					t_start: start,
					t_end: end
				}
			}).success(function (data, status, headers, response) {
				deferred.resolve(data);
			}).error(function (data, status, headers, response) {
				deferred.reject(status);
			});

			return deferred.promise;
		}
	}
})

.factory('ridesFactory', function ($q, $http) {
	return {
		get: function (start, end) {
			// YYYY-mm-dd HH:MM:SS
			var deferred = $q.defer();
			$http({
				method: 'GET',
				url: '/rides',
				params: {
					t_start: start,
					t_end: end,
					form: 'array'
				}
			}).success(function (data, status, headers, response) {
				deferred.resolve(data);
			}).error(function (data, status, headers, response) {
				deferred.reject(status);
			});

			return deferred.promise;
		}
	}
})

.factory('stationsFactory', function ($q, $http) {
	return {
		get: function () {
			// YYYY-mm-dd HH:MM:SS
			var deferred = $q.defer();
			$http({
				method: 'GET',
				url: '/stations',
			}).success(function (data, status, headers, response) {
				deferred.resolve(data);
			}).error(function (data, status, headers, response) {
				deferred.reject(status);
			});

			return deferred.promise;
		}
	}
});
