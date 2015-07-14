
/*
ATTRIBUTION: this code is lightly adapted from Steven Hall's
	implementation to add a little more functionality. Credit
	for the original code goes to him.
*/

L.HexbinLayer = L.Class.extend({
	includes: L.Mixin.Events,
	initialize: function (data, options) {
		this.levels = {};
		this.layout = d3.hexbin().radius(options.radius);
		this.r_scale = d3.scale.sqrt().range([0, options.radius]).clamp(options.clamp);

		// maybe pass in a function for doing this too, taking counts and
		// returning a size
		// this.r_scale = options.scale;
		this.data = data != null ? data : {features: []};
		this.options = options;
	},
	project: function (pt) {
		// expects lng/lat, as usual
		var point = this.map.latLngToLayerPoint([pt[1], pt[0]]);
		return [point.x, point.y];
	},
	getBounds: function (data) {
		if (data.features.length < 1) {
			return L.bounds([0, 0], [0, 0]);
		} else {
			var bounds = d3.geo.bounds(data);
			return L.bounds(
				this.project([bounds[0][0], bounds[1][1]]),
				this.project([bounds[1][0], bounds[0][1]])
			);
		}
	},
	redraw: function () {
		var padding = this.options.radius * 2;
		var bounds = this.getBounds(this.data);
		var zoom = this.map.getZoom();
		this.container
			.attr('width', bounds.getSize().x + 2 * padding)
			.attr('height', bounds.getSize().y + 2 * padding)
			.style("margin-left", (bounds.min.x - padding) + "px")
			.style("margin-top", (bounds.min.y - padding) + "px");
		// bounds.min is the top-left point of the bounds, conveniently
		if (!(zoom in this.levels)) {
			this.levels[zoom] = this.container.append('g')
				.attr('class', 'zoom-' + zoom);
			this.generateHexagons(this.levels[zoom]);
			this.levels[zoom]
				.attr('transform', 'translate(' + -(bounds.min.x - padding)
					+ ',' + -(bounds.min.y - padding) + ')');
		}
		if (this.current_level) {
			this.current_level.style('display', 'none');
		}
		this.current_level = this.levels[zoom];
		this.current_level.style('display', 'inline');
	},
	onAdd: function (map) {
		this.map = map;
		if (this.container == null) {
			var overlayPane = this.map.getPanes().overlayPane;
			this.container = d3.select(overlayPane)
				.append('svg')
				.attr('id', 'hexbin-container')
				.classed('leaflet-layer', true)
				.classed('leaflet-zoom-hide', true);
		}
		map.on({ 'moveend': this.redraw }, this);
		this.redraw();
	},
	onRemove: function (map) {
		if (this.container != null) {
			this.container.remove();
		}
		map.off({'moveend': this.redraw }, this);
		this.container = null;
		this.map = null;
		this.levels = {};
	},
	addTo: function (map) {
		map.addLayer(this);
		return this;
	},
	generateHexagons: function (container) {
		var data = this.data.features.map(function (e) {
			var coords = this.project(e.geometry.coordinates);
			return [coords[0], coords[1], e.properties];
		}, this);

		var bins = this.layout(data);
		var counts = [];
		bins.map(function (e) { counts.push(e.length); });
		// add in something to make this variable later
		this.r_scale.domain([0, ss.mean(counts) + ss.standard_deviation(counts) * 10]);

		var hexagons = container.selectAll('.hexagon').data(bins);
		var path = hexagons.enter()
			.append('path')
			.attr('class', 'hexagon');
		this.options.style.call(this, path);

		var layer_this = this;
		hexagons
			.attr('d', function (e) {
				return layer_this.layout.hexagon(layer_this.r_scale(e.length));
			})
			.attr('transform', function (e) {
				return 'translate(' + e.x + ',' + e.y + ')';
			})
			.on('mouseover', layer_this.options.mouseover.call(this))
			.on('mouseout', layer_this.options.mouseout.call(this))
			.on('click', layer_this.options.click.call(this))
			.attr('opacity', layer_this.options.opacity);

		hexagons.exit().transition().duration(50).attr('opacity', 0.01).remove();
	},
	setData: function (data) {
		this.data = data != null ? data : {features: []};
		this.levels = {};
		this.redraw();
		return this;
	}
});

L.hexbinLayer = function (data, options) {
	return new L.HexbinLayer(data, options);
};
