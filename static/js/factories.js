
/*
	TO DO
	- this is very not dry. make factory factories that take in
		a url and parameter names, as well as a caching option

*/

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
			$http.get('/rides/' + x + '/' + y)
			.success(function (data, status, headers, response) {
				deferred.resolve(data);
			}).error(function (data, status, headers, response) {
				deferred.reject(status);
			});

			return deferred.promise;
		}
	};
})

.factory('bikeDirections', function ($q, $http) {
	return {
		get: function (x, y) {
			// takes in station id x, station id y
			var deferred = $q.defer();
			$http.get('/bike_station_route/' + x + '/' + y)
			.success(function (data, status, headers, response) {
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
})

.factory('blockGroupsFactory', function ($q, $http) {
	return {
		get: function (field) {
			var deferred = $q.defer();
			$http({
				method: 'GET',
				url: '/block_groups',
				params: {
					type: field
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

.factory('subwayStationsFactory', function ($q, $http) {
	return {
		get: function () {
			var deferred = $q.defer();
			$http.get('/subway_stations'
			).success(function (data, status, headers, response) {
				deferred.resolve(data);
			}).error(function (data, status, headers, response) {
				deferred.reject(status);
			});

			return deferred.promise;
		}
	}
})

.factory('pointsOfInterestFactory', function ($q, $http) {
	return {
		get: function () {
			var deferred = $q.defer();
			$http.get('/points_of_interest'
			).success(function (data, status, headers, response) {
				deferred.resolve(data);
			}).error(function (data, status, headers, response) {
				deferred.reject(status);
			});

			return deferred.promise;
		}
	}
})

.factory('weatherFactory', function ($q, $http) {
	return {
		get: function (start, end) {
			// YYYY-mm-dd HH:MM:SS
			var deferred = $q.defer();
			$http({
				method: 'GET',
				url: '/weather',
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
});
