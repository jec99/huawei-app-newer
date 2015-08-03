
angular.module('mapApp', [
	'mapApp.factories',
	'mapApp.chartController',
	'mapApp.mapController',
	'mapApp.graphController',
	'ngMaterial'])

.controller('MainController', function ($scope, $rootScope, $q) {
	return 0;
});

function unusedCode () {
	// use heatmaps to visualize the results of the PageRank algorithm
	// maybe do that thing where we have the layers stacked in 3d space

	var heatmap = h337.create({
		radius: 20,
		blur: 1,
		maxOpacity: 0.9,
		minOpacity: 0.3,
		useLocalExtrema: true,
		gradient: {
			0       : '#eee',
			0.2     : '#eee',
			0.20001 : '#bbb',
			0.4     : '#bbb',
			0.40001 : '#888',
			0.6     : '#888',
			0.60001 : '#444',
			0.8     : '#444',
			0.80001 : '#111',
			1       : '#111'
		},
		container: d3.select('#scatterplot #heatmap-container')[0][0]
	});

	heatmap.setData({
		min: 0,
		max: 1,
		data: data.data.map(function (d) {
			return {x: xScatter(d.lng), y: yScatter(d.lat), value: 1};
		})
	});
}

