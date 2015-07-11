
angular.module('mapApp', ['mapApp.factories', 'ngMaterial'])

.controller('MainController', function ($scope, $rootScope, $q, bikeRides, stationData, bikeDirections, leafletEvents) {
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

