
angular.module('mapApp.graphController', [])

.controller('GraphController', function ($scope, ridesFactory, stationsFactory) {

	var t_start = '2012-06-01 00:00:00',
			t_end = '2012-06-15 00:00:00';

	var map_center = [-77.034136, 38.96];
	var map_width = 500,
			map_height = 500;

	var projection = d3.geo.mercator()
		.scale((1 << 19) / 2 / Math.PI)
		.center(map_center);

	stationsFactory.get().then(function (data) {
		var stations = [];
		for (var i = 0; i < data.data.length; i++) {
			var x = data.data[i];
			stations.push({ id: x.id, lng: x.lng, lat: x.lat });			
		}

		var g = {
			nodes: [],
			edges: []
		};

		var o;
		var c;
		stations.forEach(function (e) {
			c = projection([e.lng, e.lat]);
			o = {
				id: '' + e.id,
				x: c[0],
				y: c[1],
				size: Math.floor(Math.random() * 5) + 1,
				// color: '#888'
			};
			g.nodes.push(o);
		});

		var s = new sigma({
			graph: g,
			container: 'sigma-graph',
			settings: {
				defaultEdgeColor: '#000',
				defaultNodeColor: '#666',
				minEdgeSize: 0,
				maxEdgeSize: 10,
				minNodeSize: 0,
				maxNodeSize: 5,
				borderSize: 1,
				defaultNodeBorderColor: '#000',
				zoomingRatio: 1.5,
				nodesPowRatio: 0.5,
				edgesPowRatio: 0.5
			}
		});
	});
});