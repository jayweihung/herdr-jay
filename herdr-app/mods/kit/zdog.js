/*! Zdog v1.1.3, MIT license, https://zzz.dog : its js/index.js bundled as one ES module (esbuild --format=esm) */
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// package/js/boilerplate.js
var require_boilerplate = __commonJS({
  "package/js/boilerplate.js"(exports, module) {
    (function(root, factory) {
      if (typeof module == "object" && module.exports) {
        module.exports = factory();
      } else {
        root.Zdog = factory();
      }
    })(exports, function factory() {
      var Zdog = {};
      Zdog.TAU = Math.PI * 2;
      Zdog.extend = function(a, b) {
        for (var prop in b) {
          a[prop] = b[prop];
        }
        return a;
      };
      Zdog.lerp = function(a, b, alpha) {
        return (b - a) * alpha + a;
      };
      Zdog.modulo = function(num, div) {
        return (num % div + div) % div;
      };
      var powerMultipliers = {
        2: function(a) {
          return a * a;
        },
        3: function(a) {
          return a * a * a;
        },
        4: function(a) {
          return a * a * a * a;
        },
        5: function(a) {
          return a * a * a * a * a;
        }
      };
      Zdog.easeInOut = function(alpha, power) {
        if (power == 1) {
          return alpha;
        }
        alpha = Math.max(0, Math.min(1, alpha));
        var isFirstHalf = alpha < 0.5;
        var slope = isFirstHalf ? alpha : 1 - alpha;
        slope /= 0.5;
        var powerMultiplier = powerMultipliers[power] || powerMultipliers[2];
        var curve = powerMultiplier(slope);
        curve /= 2;
        return isFirstHalf ? curve : 1 - curve;
      };
      return Zdog;
    });
  }
});

// package/js/canvas-renderer.js
var require_canvas_renderer = __commonJS({
  "package/js/canvas-renderer.js"(exports, module) {
    (function(root, factory) {
      if (typeof module == "object" && module.exports) {
        module.exports = factory();
      } else {
        root.Zdog.CanvasRenderer = factory();
      }
    })(exports, function factory() {
      var CanvasRenderer = { isCanvas: true };
      CanvasRenderer.begin = function(ctx) {
        ctx.beginPath();
      };
      CanvasRenderer.move = function(ctx, elem, point) {
        ctx.moveTo(point.x, point.y);
      };
      CanvasRenderer.line = function(ctx, elem, point) {
        ctx.lineTo(point.x, point.y);
      };
      CanvasRenderer.bezier = function(ctx, elem, cp0, cp1, end) {
        ctx.bezierCurveTo(cp0.x, cp0.y, cp1.x, cp1.y, end.x, end.y);
      };
      CanvasRenderer.closePath = function(ctx) {
        ctx.closePath();
      };
      CanvasRenderer.setPath = function() {
      };
      CanvasRenderer.renderPath = function(ctx, elem, pathCommands, isClosed) {
        this.begin(ctx, elem);
        pathCommands.forEach(function(command) {
          command.render(ctx, elem, CanvasRenderer);
        });
        if (isClosed) {
          this.closePath(ctx, elem);
        }
      };
      CanvasRenderer.stroke = function(ctx, elem, isStroke, color, lineWidth) {
        if (!isStroke) {
          return;
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
      };
      CanvasRenderer.fill = function(ctx, elem, isFill, color) {
        if (!isFill) {
          return;
        }
        ctx.fillStyle = color;
        ctx.fill();
      };
      CanvasRenderer.end = function() {
      };
      return CanvasRenderer;
    });
  }
});

// package/js/svg-renderer.js
var require_svg_renderer = __commonJS({
  "package/js/svg-renderer.js"(exports, module) {
    (function(root, factory) {
      if (typeof module == "object" && module.exports) {
        module.exports = factory();
      } else {
        root.Zdog.SvgRenderer = factory();
      }
    })(exports, function factory() {
      var SvgRenderer = { isSvg: true };
      var round = SvgRenderer.round = function(num) {
        return Math.round(num * 1e3) / 1e3;
      };
      function getPointString(point) {
        return round(point.x) + "," + round(point.y) + " ";
      }
      SvgRenderer.begin = function() {
      };
      SvgRenderer.move = function(svg, elem, point) {
        return "M" + getPointString(point);
      };
      SvgRenderer.line = function(svg, elem, point) {
        return "L" + getPointString(point);
      };
      SvgRenderer.bezier = function(svg, elem, cp0, cp1, end) {
        return "C" + getPointString(cp0) + getPointString(cp1) + getPointString(end);
      };
      SvgRenderer.closePath = function() {
        return "Z";
      };
      SvgRenderer.setPath = function(svg, elem, pathValue) {
        elem.setAttribute("d", pathValue);
      };
      SvgRenderer.renderPath = function(svg, elem, pathCommands, isClosed) {
        var pathValue = "";
        pathCommands.forEach(function(command) {
          pathValue += command.render(svg, elem, SvgRenderer);
        });
        if (isClosed) {
          pathValue += this.closePath(svg, elem);
        }
        this.setPath(svg, elem, pathValue);
      };
      SvgRenderer.stroke = function(svg, elem, isStroke, color, lineWidth) {
        if (!isStroke) {
          return;
        }
        elem.setAttribute("stroke", color);
        elem.setAttribute("stroke-width", lineWidth);
      };
      SvgRenderer.fill = function(svg, elem, isFill, color) {
        var fillColor = isFill ? color : "none";
        elem.setAttribute("fill", fillColor);
      };
      SvgRenderer.end = function(svg, elem) {
        svg.appendChild(elem);
      };
      return SvgRenderer;
    });
  }
});

// package/js/vector.js
var require_vector = __commonJS({
  "package/js/vector.js"(exports, module) {
    (function(root, factory) {
      if (typeof module == "object" && module.exports) {
        module.exports = factory(require_boilerplate());
      } else {
        var Zdog = root.Zdog;
        Zdog.Vector = factory(Zdog);
      }
    })(exports, function factory(utils) {
      function Vector(position) {
        this.set(position);
      }
      var TAU = utils.TAU;
      Vector.prototype.set = function(pos) {
        this.x = pos && pos.x || 0;
        this.y = pos && pos.y || 0;
        this.z = pos && pos.z || 0;
        return this;
      };
      Vector.prototype.write = function(pos) {
        if (!pos) {
          return this;
        }
        this.x = pos.x != void 0 ? pos.x : this.x;
        this.y = pos.y != void 0 ? pos.y : this.y;
        this.z = pos.z != void 0 ? pos.z : this.z;
        return this;
      };
      Vector.prototype.rotate = function(rotation) {
        if (!rotation) {
          return;
        }
        this.rotateZ(rotation.z);
        this.rotateY(rotation.y);
        this.rotateX(rotation.x);
        return this;
      };
      Vector.prototype.rotateZ = function(angle) {
        rotateProperty(this, angle, "x", "y");
      };
      Vector.prototype.rotateX = function(angle) {
        rotateProperty(this, angle, "y", "z");
      };
      Vector.prototype.rotateY = function(angle) {
        rotateProperty(this, angle, "x", "z");
      };
      function rotateProperty(vec, angle, propA, propB) {
        if (!angle || angle % TAU === 0) {
          return;
        }
        var cos = Math.cos(angle);
        var sin = Math.sin(angle);
        var a = vec[propA];
        var b = vec[propB];
        vec[propA] = a * cos - b * sin;
        vec[propB] = b * cos + a * sin;
      }
      Vector.prototype.isSame = function(pos) {
        if (!pos) {
          return false;
        }
        return this.x === pos.x && this.y === pos.y && this.z === pos.z;
      };
      Vector.prototype.add = function(pos) {
        if (!pos) {
          return this;
        }
        this.x += pos.x || 0;
        this.y += pos.y || 0;
        this.z += pos.z || 0;
        return this;
      };
      Vector.prototype.subtract = function(pos) {
        if (!pos) {
          return this;
        }
        this.x -= pos.x || 0;
        this.y -= pos.y || 0;
        this.z -= pos.z || 0;
        return this;
      };
      Vector.prototype.multiply = function(pos) {
        if (pos == void 0) {
          return this;
        }
        if (typeof pos == "number") {
          this.x *= pos;
          this.y *= pos;
          this.z *= pos;
        } else {
          this.x *= pos.x != void 0 ? pos.x : 1;
          this.y *= pos.y != void 0 ? pos.y : 1;
          this.z *= pos.z != void 0 ? pos.z : 1;
        }
        return this;
      };
      Vector.prototype.transform = function(translation, rotation, scale) {
        this.multiply(scale);
        this.rotate(rotation);
        this.add(translation);
        return this;
      };
      Vector.prototype.lerp = function(pos, alpha) {
        this.x = utils.lerp(this.x, pos.x || 0, alpha);
        this.y = utils.lerp(this.y, pos.y || 0, alpha);
        this.z = utils.lerp(this.z, pos.z || 0, alpha);
        return this;
      };
      Vector.prototype.magnitude = function() {
        var sum = this.x * this.x + this.y * this.y + this.z * this.z;
        return getMagnitudeSqrt(sum);
      };
      function getMagnitudeSqrt(sum) {
        if (Math.abs(sum - 1) < 1e-8) {
          return 1;
        }
        return Math.sqrt(sum);
      }
      Vector.prototype.magnitude2d = function() {
        var sum = this.x * this.x + this.y * this.y;
        return getMagnitudeSqrt(sum);
      };
      Vector.prototype.copy = function() {
        return new Vector(this);
      };
      return Vector;
    });
  }
});

// package/js/anchor.js
var require_anchor = __commonJS({
  "package/js/anchor.js"(exports, module) {
    (function(root, factory) {
      if (typeof module == "object" && module.exports) {
        module.exports = factory(
          require_boilerplate(),
          require_vector(),
          require_canvas_renderer(),
          require_svg_renderer()
        );
      } else {
        var Zdog = root.Zdog;
        Zdog.Anchor = factory(
          Zdog,
          Zdog.Vector,
          Zdog.CanvasRenderer,
          Zdog.SvgRenderer
        );
      }
    })(exports, function factory(utils, Vector, CanvasRenderer, SvgRenderer) {
      var TAU = utils.TAU;
      var onePoint = { x: 1, y: 1, z: 1 };
      function Anchor(options) {
        this.create(options || {});
      }
      Anchor.prototype.create = function(options) {
        this.children = [];
        utils.extend(this, this.constructor.defaults);
        this.setOptions(options);
        this.translate = new Vector(options.translate);
        this.rotate = new Vector(options.rotate);
        this.scale = new Vector(onePoint).multiply(this.scale);
        this.origin = new Vector();
        this.renderOrigin = new Vector();
        if (this.addTo) {
          this.addTo.addChild(this);
        }
      };
      Anchor.defaults = {};
      Anchor.optionKeys = Object.keys(Anchor.defaults).concat([
        "rotate",
        "translate",
        "scale",
        "addTo"
      ]);
      Anchor.prototype.setOptions = function(options) {
        var optionKeys = this.constructor.optionKeys;
        for (var key in options) {
          if (optionKeys.indexOf(key) != -1) {
            this[key] = options[key];
          }
        }
      };
      Anchor.prototype.addChild = function(shape) {
        if (this.children.indexOf(shape) != -1) {
          return;
        }
        shape.remove();
        shape.addTo = this;
        this.children.push(shape);
      };
      Anchor.prototype.removeChild = function(shape) {
        var index = this.children.indexOf(shape);
        if (index != -1) {
          this.children.splice(index, 1);
        }
      };
      Anchor.prototype.remove = function() {
        if (this.addTo) {
          this.addTo.removeChild(this);
        }
      };
      Anchor.prototype.update = function() {
        this.reset();
        this.children.forEach(function(child) {
          child.update();
        });
        this.transform(this.translate, this.rotate, this.scale);
      };
      Anchor.prototype.reset = function() {
        this.renderOrigin.set(this.origin);
      };
      Anchor.prototype.transform = function(translation, rotation, scale) {
        this.renderOrigin.transform(translation, rotation, scale);
        this.children.forEach(function(child) {
          child.transform(translation, rotation, scale);
        });
      };
      Anchor.prototype.updateGraph = function() {
        this.update();
        this.updateFlatGraph();
        this.flatGraph.forEach(function(item) {
          item.updateSortValue();
        });
        this.flatGraph.sort(Anchor.shapeSorter);
      };
      Anchor.shapeSorter = function(a, b) {
        return a.sortValue - b.sortValue;
      };
      Object.defineProperty(Anchor.prototype, "flatGraph", {
        get: function() {
          if (!this._flatGraph) {
            this.updateFlatGraph();
          }
          return this._flatGraph;
        },
        set: function(graph) {
          this._flatGraph = graph;
        }
      });
      Anchor.prototype.updateFlatGraph = function() {
        this.flatGraph = this.getFlatGraph();
      };
      Anchor.prototype.getFlatGraph = function() {
        var flatGraph = [this];
        return this.addChildFlatGraph(flatGraph);
      };
      Anchor.prototype.addChildFlatGraph = function(flatGraph) {
        this.children.forEach(function(child) {
          var childFlatGraph = child.getFlatGraph();
          Array.prototype.push.apply(flatGraph, childFlatGraph);
        });
        return flatGraph;
      };
      Anchor.prototype.updateSortValue = function() {
        this.sortValue = this.renderOrigin.z;
      };
      Anchor.prototype.render = function() {
      };
      Anchor.prototype.renderGraphCanvas = function(ctx) {
        if (!ctx) {
          throw new Error("ctx is " + ctx + ". Canvas context required for render. Check .renderGraphCanvas( ctx ).");
        }
        this.flatGraph.forEach(function(item) {
          item.render(ctx, CanvasRenderer);
        });
      };
      Anchor.prototype.renderGraphSvg = function(svg) {
        if (!svg) {
          throw new Error("svg is " + svg + ". SVG required for render. Check .renderGraphSvg( svg ).");
        }
        this.flatGraph.forEach(function(item) {
          item.render(svg, SvgRenderer);
        });
      };
      Anchor.prototype.copy = function(options) {
        var itemOptions = {};
        var optionKeys = this.constructor.optionKeys;
        optionKeys.forEach(function(key) {
          itemOptions[key] = this[key];
        }, this);
        utils.extend(itemOptions, options);
        var ItemClass = this.constructor;
        return new ItemClass(itemOptions);
      };
      Anchor.prototype.copyGraph = function(options) {
        var clone = this.copy(options);
        this.children.forEach(function(child) {
          child.copyGraph({
            addTo: clone
          });
        });
        return clone;
      };
      Anchor.prototype.normalizeRotate = function() {
        this.rotate.x = utils.modulo(this.rotate.x, TAU);
        this.rotate.y = utils.modulo(this.rotate.y, TAU);
        this.rotate.z = utils.modulo(this.rotate.z, TAU);
      };
      function getSubclass(Super) {
        return function(defaults) {
          function Item(options) {
            this.create(options || {});
          }
          Item.prototype = Object.create(Super.prototype);
          Item.prototype.constructor = Item;
          Item.defaults = utils.extend({}, Super.defaults);
          utils.extend(Item.defaults, defaults);
          Item.optionKeys = Super.optionKeys.slice(0);
          Object.keys(Item.defaults).forEach(function(key) {
            if (!Item.optionKeys.indexOf(key) != 1) {
              Item.optionKeys.push(key);
            }
          });
          Item.subclass = getSubclass(Item);
          return Item;
        };
      }
      Anchor.subclass = getSubclass(Anchor);
      return Anchor;
    });
  }
});

// package/js/dragger.js
var require_dragger = __commonJS({
  "package/js/dragger.js"(exports, module) {
    (function(root, factory) {
      if (typeof module == "object" && module.exports) {
        module.exports = factory();
      } else {
        root.Zdog.Dragger = factory();
      }
    })(exports, function factory() {
      var hasWindow = typeof window != "undefined";
      var downEvent = "mousedown";
      var moveEvent = "mousemove";
      var upEvent = "mouseup";
      if (hasWindow) {
        if (window.PointerEvent) {
          downEvent = "pointerdown";
          moveEvent = "pointermove";
          upEvent = "pointerup";
        } else if ("ontouchstart" in window) {
          downEvent = "touchstart";
          moveEvent = "touchmove";
          upEvent = "touchend";
        }
      }
      function noop() {
      }
      function Dragger(options) {
        this.create(options || {});
      }
      Dragger.prototype.create = function(options) {
        this.onDragStart = options.onDragStart || noop;
        this.onDragMove = options.onDragMove || noop;
        this.onDragEnd = options.onDragEnd || noop;
        this.bindDrag(options.startElement);
      };
      Dragger.prototype.bindDrag = function(element) {
        element = this.getQueryElement(element);
        if (!element) {
          return;
        }
        element.style.touchAction = "none";
        element.addEventListener(downEvent, this);
      };
      Dragger.prototype.getQueryElement = function(element) {
        if (typeof element == "string") {
          element = document.querySelector(element);
        }
        return element;
      };
      Dragger.prototype.handleEvent = function(event) {
        var method = this["on" + event.type];
        if (method) {
          method.call(this, event);
        }
      };
      Dragger.prototype.onmousedown = Dragger.prototype.onpointerdown = function(event) {
        this.dragStart(event, event);
      };
      Dragger.prototype.ontouchstart = function(event) {
        this.dragStart(event, event.changedTouches[0]);
      };
      Dragger.prototype.dragStart = function(event, pointer) {
        event.preventDefault();
        this.dragStartX = pointer.pageX;
        this.dragStartY = pointer.pageY;
        if (hasWindow) {
          window.addEventListener(moveEvent, this);
          window.addEventListener(upEvent, this);
        }
        this.onDragStart(pointer);
      };
      Dragger.prototype.ontouchmove = function(event) {
        this.dragMove(event, event.changedTouches[0]);
      };
      Dragger.prototype.onmousemove = Dragger.prototype.onpointermove = function(event) {
        this.dragMove(event, event);
      };
      Dragger.prototype.dragMove = function(event, pointer) {
        event.preventDefault();
        var moveX = pointer.pageX - this.dragStartX;
        var moveY = pointer.pageY - this.dragStartY;
        this.onDragMove(pointer, moveX, moveY);
      };
      Dragger.prototype.onmouseup = Dragger.prototype.onpointerup = Dragger.prototype.ontouchend = Dragger.prototype.dragEnd = function() {
        window.removeEventListener(moveEvent, this);
        window.removeEventListener(upEvent, this);
        this.onDragEnd();
      };
      return Dragger;
    });
  }
});

// package/js/illustration.js
var require_illustration = __commonJS({
  "package/js/illustration.js"(exports, module) {
    (function(root, factory) {
      if (typeof module == "object" && module.exports) {
        module.exports = factory(
          require_boilerplate(),
          require_anchor(),
          require_dragger()
        );
      } else {
        var Zdog = root.Zdog;
        Zdog.Illustration = factory(Zdog, Zdog.Anchor, Zdog.Dragger);
      }
    })(exports, function factory(utils, Anchor, Dragger) {
      function noop() {
      }
      var TAU = utils.TAU;
      var Illustration = Anchor.subclass({
        element: void 0,
        centered: true,
        zoom: 1,
        dragRotate: false,
        resize: false,
        onPrerender: noop,
        onDragStart: noop,
        onDragMove: noop,
        onDragEnd: noop,
        onResize: noop
      });
      utils.extend(Illustration.prototype, Dragger.prototype);
      Illustration.prototype.create = function(options) {
        Anchor.prototype.create.call(this, options);
        Dragger.prototype.create.call(this, options);
        this.setElement(this.element);
        this.setDragRotate(this.dragRotate);
        this.setResize(this.resize);
      };
      Illustration.prototype.setElement = function(element) {
        element = this.getQueryElement(element);
        if (!element) {
          throw new Error("Zdog.Illustration element required. Set to " + element);
        }
        var nodeName = element.nodeName.toLowerCase();
        if (nodeName == "canvas") {
          this.setCanvas(element);
        } else if (nodeName == "svg") {
          this.setSvg(element);
        }
      };
      Illustration.prototype.setSize = function(width, height) {
        width = Math.round(width);
        height = Math.round(height);
        if (this.isCanvas) {
          this.setSizeCanvas(width, height);
        } else if (this.isSvg) {
          this.setSizeSvg(width, height);
        }
      };
      Illustration.prototype.setResize = function(resize) {
        this.resize = resize;
        if (!this.resizeListener) {
          this.resizeListener = this.onWindowResize.bind(this);
        }
        if (resize) {
          window.addEventListener("resize", this.resizeListener);
          this.onWindowResize();
        } else {
          window.removeEventListener("resize", this.resizeListener);
        }
      };
      Illustration.prototype.onWindowResize = function() {
        this.setMeasuredSize();
        this.onResize(this.width, this.height);
      };
      Illustration.prototype.setMeasuredSize = function() {
        var width, height;
        var isFullscreen = this.resize == "fullscreen";
        if (isFullscreen) {
          width = window.innerWidth;
          height = window.innerHeight;
        } else {
          var rect = this.element.getBoundingClientRect();
          width = rect.width;
          height = rect.height;
        }
        this.setSize(width, height);
      };
      Illustration.prototype.renderGraph = function(item) {
        if (this.isCanvas) {
          this.renderGraphCanvas(item);
        } else if (this.isSvg) {
          this.renderGraphSvg(item);
        }
      };
      Illustration.prototype.updateRenderGraph = function(item) {
        this.updateGraph();
        this.renderGraph(item);
      };
      Illustration.prototype.setCanvas = function(element) {
        this.element = element;
        this.isCanvas = true;
        this.ctx = this.element.getContext("2d");
        this.setSizeCanvas(element.width, element.height);
      };
      Illustration.prototype.setSizeCanvas = function(width, height) {
        this.width = width;
        this.height = height;
        var pixelRatio = this.pixelRatio = window.devicePixelRatio || 1;
        this.element.width = this.canvasWidth = width * pixelRatio;
        this.element.height = this.canvasHeight = height * pixelRatio;
        var needsHighPixelRatioSizing = pixelRatio > 1 && !this.resize;
        if (needsHighPixelRatioSizing) {
          this.element.style.width = width + "px";
          this.element.style.height = height + "px";
        }
      };
      Illustration.prototype.renderGraphCanvas = function(item) {
        item = item || this;
        this.prerenderCanvas();
        Anchor.prototype.renderGraphCanvas.call(item, this.ctx);
        this.postrenderCanvas();
      };
      Illustration.prototype.prerenderCanvas = function() {
        var ctx = this.ctx;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
        ctx.save();
        if (this.centered) {
          var centerX = this.width / 2 * this.pixelRatio;
          var centerY = this.height / 2 * this.pixelRatio;
          ctx.translate(centerX, centerY);
        }
        var scale = this.pixelRatio * this.zoom;
        ctx.scale(scale, scale);
        this.onPrerender(ctx);
      };
      Illustration.prototype.postrenderCanvas = function() {
        this.ctx.restore();
      };
      Illustration.prototype.setSvg = function(element) {
        this.element = element;
        this.isSvg = true;
        this.pixelRatio = 1;
        var width = element.getAttribute("width");
        var height = element.getAttribute("height");
        this.setSizeSvg(width, height);
      };
      Illustration.prototype.setSizeSvg = function(width, height) {
        this.width = width;
        this.height = height;
        var viewWidth = width / this.zoom;
        var viewHeight = height / this.zoom;
        var viewX = this.centered ? -viewWidth / 2 : 0;
        var viewY = this.centered ? -viewHeight / 2 : 0;
        this.element.setAttribute("viewBox", viewX + " " + viewY + " " + viewWidth + " " + viewHeight);
        if (this.resize) {
          this.element.removeAttribute("width");
          this.element.removeAttribute("height");
        } else {
          this.element.setAttribute("width", width);
          this.element.setAttribute("height", height);
        }
      };
      Illustration.prototype.renderGraphSvg = function(item) {
        item = item || this;
        empty(this.element);
        this.onPrerender(this.element);
        Anchor.prototype.renderGraphSvg.call(item, this.element);
      };
      function empty(element) {
        while (element.firstChild) {
          element.removeChild(element.firstChild);
        }
      }
      Illustration.prototype.setDragRotate = function(item) {
        if (!item) {
          return;
        } else if (item === true) {
          item = this;
        }
        this.dragRotate = item;
        this.bindDrag(this.element);
      };
      Illustration.prototype.dragStart = function() {
        this.dragStartRX = this.dragRotate.rotate.x;
        this.dragStartRY = this.dragRotate.rotate.y;
        Dragger.prototype.dragStart.apply(this, arguments);
      };
      Illustration.prototype.dragMove = function(event, pointer) {
        var moveX = pointer.pageX - this.dragStartX;
        var moveY = pointer.pageY - this.dragStartY;
        var displaySize = Math.min(this.width, this.height);
        var moveRY = moveX / displaySize * TAU;
        var moveRX = moveY / displaySize * TAU;
        this.dragRotate.rotate.x = this.dragStartRX - moveRX;
        this.dragRotate.rotate.y = this.dragStartRY - moveRY;
        Dragger.prototype.dragMove.apply(this, arguments);
      };
      return Illustration;
    });
  }
});

// package/js/path-command.js
var require_path_command = __commonJS({
  "package/js/path-command.js"(exports, module) {
    (function(root, factory) {
      if (typeof module == "object" && module.exports) {
        module.exports = factory(require_vector());
      } else {
        var Zdog = root.Zdog;
        Zdog.PathCommand = factory(Zdog.Vector);
      }
    })(exports, function factory(Vector) {
      function PathCommand(method, points, previousPoint) {
        this.method = method;
        this.points = points.map(mapVectorPoint);
        this.renderPoints = points.map(mapNewVector);
        this.previousPoint = previousPoint;
        this.endRenderPoint = this.renderPoints[this.renderPoints.length - 1];
        if (method == "arc") {
          this.controlPoints = [new Vector(), new Vector()];
        }
      }
      function mapVectorPoint(point) {
        if (point instanceof Vector) {
          return point;
        } else {
          return new Vector(point);
        }
      }
      function mapNewVector(point) {
        return new Vector(point);
      }
      PathCommand.prototype.reset = function() {
        var points = this.points;
        this.renderPoints.forEach(function(renderPoint, i) {
          var point = points[i];
          renderPoint.set(point);
        });
      };
      PathCommand.prototype.transform = function(translation, rotation, scale) {
        this.renderPoints.forEach(function(renderPoint) {
          renderPoint.transform(translation, rotation, scale);
        });
      };
      PathCommand.prototype.render = function(ctx, elem, renderer) {
        return this[this.method](ctx, elem, renderer);
      };
      PathCommand.prototype.move = function(ctx, elem, renderer) {
        return renderer.move(ctx, elem, this.renderPoints[0]);
      };
      PathCommand.prototype.line = function(ctx, elem, renderer) {
        return renderer.line(ctx, elem, this.renderPoints[0]);
      };
      PathCommand.prototype.bezier = function(ctx, elem, renderer) {
        var cp0 = this.renderPoints[0];
        var cp1 = this.renderPoints[1];
        var end = this.renderPoints[2];
        return renderer.bezier(ctx, elem, cp0, cp1, end);
      };
      var arcHandleLength = 9 / 16;
      PathCommand.prototype.arc = function(ctx, elem, renderer) {
        var prev = this.previousPoint;
        var corner = this.renderPoints[0];
        var end = this.renderPoints[1];
        var cp0 = this.controlPoints[0];
        var cp1 = this.controlPoints[1];
        cp0.set(prev).lerp(corner, arcHandleLength);
        cp1.set(end).lerp(corner, arcHandleLength);
        return renderer.bezier(ctx, elem, cp0, cp1, end);
      };
      return PathCommand;
    });
  }
});

// package/js/shape.js
var require_shape = __commonJS({
  "package/js/shape.js"(exports, module) {
    (function(root, factory) {
      if (typeof module == "object" && module.exports) {
        module.exports = factory(
          require_boilerplate(),
          require_vector(),
          require_path_command(),
          require_anchor()
        );
      } else {
        var Zdog = root.Zdog;
        Zdog.Shape = factory(Zdog, Zdog.Vector, Zdog.PathCommand, Zdog.Anchor);
      }
    })(exports, function factory(utils, Vector, PathCommand, Anchor) {
      var Shape = Anchor.subclass({
        stroke: 1,
        fill: false,
        color: "#333",
        closed: true,
        visible: true,
        path: [{}],
        front: { z: 1 },
        backface: true
      });
      Shape.prototype.create = function(options) {
        Anchor.prototype.create.call(this, options);
        this.updatePath();
        this.front = new Vector(options.front || this.front);
        this.renderFront = new Vector(this.front);
        this.renderNormal = new Vector();
      };
      var actionNames = [
        "move",
        "line",
        "bezier",
        "arc"
      ];
      Shape.prototype.updatePath = function() {
        this.setPath();
        this.updatePathCommands();
      };
      Shape.prototype.setPath = function() {
      };
      Shape.prototype.updatePathCommands = function() {
        var previousPoint;
        this.pathCommands = this.path.map(function(pathPart, i) {
          var keys = Object.keys(pathPart);
          var method = keys[0];
          var points = pathPart[method];
          var isInstruction = keys.length == 1 && actionNames.indexOf(method) != -1;
          if (!isInstruction) {
            method = "line";
            points = pathPart;
          }
          var isLineOrMove = method == "line" || method == "move";
          var isPointsArray = Array.isArray(points);
          if (isLineOrMove && !isPointsArray) {
            points = [points];
          }
          method = i === 0 ? "move" : method;
          var command = new PathCommand(method, points, previousPoint);
          previousPoint = command.endRenderPoint;
          return command;
        });
      };
      Shape.prototype.reset = function() {
        this.renderOrigin.set(this.origin);
        this.renderFront.set(this.front);
        this.pathCommands.forEach(function(command) {
          command.reset();
        });
      };
      Shape.prototype.transform = function(translation, rotation, scale) {
        this.renderOrigin.transform(translation, rotation, scale);
        this.renderFront.transform(translation, rotation, scale);
        this.renderNormal.set(this.renderOrigin).subtract(this.renderFront);
        this.pathCommands.forEach(function(command) {
          command.transform(translation, rotation, scale);
        });
        this.children.forEach(function(child) {
          child.transform(translation, rotation, scale);
        });
      };
      Shape.prototype.updateSortValue = function() {
        var pointCount = this.pathCommands.length;
        var firstPoint = this.pathCommands[0].endRenderPoint;
        var lastPoint = this.pathCommands[pointCount - 1].endRenderPoint;
        var isSelfClosing = pointCount > 2 && firstPoint.isSame(lastPoint);
        if (isSelfClosing) {
          pointCount -= 1;
        }
        var sortValueTotal = 0;
        for (var i = 0; i < pointCount; i++) {
          sortValueTotal += this.pathCommands[i].endRenderPoint.z;
        }
        this.sortValue = sortValueTotal / pointCount;
      };
      Shape.prototype.render = function(ctx, renderer) {
        var length = this.pathCommands.length;
        if (!this.visible || !length) {
          return;
        }
        this.isFacingBack = this.renderNormal.z > 0;
        if (!this.backface && this.isFacingBack) {
          return;
        }
        if (!renderer) {
          throw new Error("Zdog renderer required. Set to " + renderer);
        }
        var isDot = length == 1;
        if (renderer.isCanvas && isDot) {
          this.renderCanvasDot(ctx, renderer);
        } else {
          this.renderPath(ctx, renderer);
        }
      };
      var TAU = utils.TAU;
      Shape.prototype.renderCanvasDot = function(ctx) {
        var lineWidth = this.getLineWidth();
        if (!lineWidth) {
          return;
        }
        ctx.fillStyle = this.getRenderColor();
        var point = this.pathCommands[0].endRenderPoint;
        ctx.beginPath();
        var radius = lineWidth / 2;
        ctx.arc(point.x, point.y, radius, 0, TAU);
        ctx.fill();
      };
      Shape.prototype.getLineWidth = function() {
        if (!this.stroke) {
          return 0;
        }
        if (this.stroke == true) {
          return 1;
        }
        return this.stroke;
      };
      Shape.prototype.getRenderColor = function() {
        var isBackfaceColor = typeof this.backface == "string" && this.isFacingBack;
        var color = isBackfaceColor ? this.backface : this.color;
        return color;
      };
      Shape.prototype.renderPath = function(ctx, renderer) {
        var elem = this.getRenderElement(ctx, renderer);
        var isTwoPoints = this.pathCommands.length == 2 && this.pathCommands[1].method == "line";
        var isClosed = !isTwoPoints && this.closed;
        var color = this.getRenderColor();
        renderer.renderPath(ctx, elem, this.pathCommands, isClosed);
        renderer.stroke(ctx, elem, this.stroke, color, this.getLineWidth());
        renderer.fill(ctx, elem, this.fill, color);
        renderer.end(ctx, elem);
      };
      var svgURI = "http://www.w3.org/2000/svg";
      Shape.prototype.getRenderElement = function(ctx, renderer) {
        if (!renderer.isSvg) {
          return;
        }
        if (!this.svgElement) {
          this.svgElement = document.createElementNS(svgURI, "path");
          this.svgElement.setAttribute("stroke-linecap", "round");
          this.svgElement.setAttribute("stroke-linejoin", "round");
        }
        return this.svgElement;
      };
      return Shape;
    });
  }
});

// package/js/group.js
var require_group = __commonJS({
  "package/js/group.js"(exports, module) {
    (function(root, factory) {
      if (typeof module == "object" && module.exports) {
        module.exports = factory(require_anchor());
      } else {
        var Zdog = root.Zdog;
        Zdog.Group = factory(Zdog.Anchor);
      }
    })(exports, function factory(Anchor) {
      var Group = Anchor.subclass({
        updateSort: false,
        visible: true
      });
      Group.prototype.updateSortValue = function() {
        var sortValueTotal = 0;
        this.flatGraph.forEach(function(item) {
          item.updateSortValue();
          sortValueTotal += item.sortValue;
        });
        this.sortValue = sortValueTotal / this.flatGraph.length;
        if (this.updateSort) {
          this.flatGraph.sort(Anchor.shapeSorter);
        }
      };
      Group.prototype.render = function(ctx, renderer) {
        if (!this.visible) {
          return;
        }
        this.flatGraph.forEach(function(item) {
          item.render(ctx, renderer);
        });
      };
      Group.prototype.updateFlatGraph = function() {
        var flatGraph = [];
        this.flatGraph = this.addChildFlatGraph(flatGraph);
      };
      Group.prototype.getFlatGraph = function() {
        return [this];
      };
      return Group;
    });
  }
});

// package/js/rect.js
var require_rect = __commonJS({
  "package/js/rect.js"(exports, module) {
    (function(root, factory) {
      if (typeof module == "object" && module.exports) {
        module.exports = factory(require_shape());
      } else {
        var Zdog = root.Zdog;
        Zdog.Rect = factory(Zdog.Shape);
      }
    })(exports, function factory(Shape) {
      var Rect = Shape.subclass({
        width: 1,
        height: 1
      });
      Rect.prototype.setPath = function() {
        var x = this.width / 2;
        var y = this.height / 2;
        this.path = [
          { x: -x, y: -y },
          { x, y: -y },
          { x, y },
          { x: -x, y }
        ];
      };
      return Rect;
    });
  }
});

// package/js/rounded-rect.js
var require_rounded_rect = __commonJS({
  "package/js/rounded-rect.js"(exports, module) {
    (function(root, factory) {
      if (typeof module == "object" && module.exports) {
        module.exports = factory(require_shape());
      } else {
        var Zdog = root.Zdog;
        Zdog.RoundedRect = factory(Zdog.Shape);
      }
    })(exports, function factory(Shape) {
      var RoundedRect = Shape.subclass({
        width: 1,
        height: 1,
        cornerRadius: 0.25,
        closed: false
      });
      RoundedRect.prototype.setPath = function() {
        var xA = this.width / 2;
        var yA = this.height / 2;
        var shortSide = Math.min(xA, yA);
        var cornerRadius = Math.min(this.cornerRadius, shortSide);
        var xB = xA - cornerRadius;
        var yB = yA - cornerRadius;
        var path = [
          // top right corner
          { x: xB, y: -yA },
          { arc: [
            { x: xA, y: -yA },
            { x: xA, y: -yB }
          ] }
        ];
        if (yB) {
          path.push({ x: xA, y: yB });
        }
        path.push({ arc: [
          { x: xA, y: yA },
          { x: xB, y: yA }
        ] });
        if (xB) {
          path.push({ x: -xB, y: yA });
        }
        path.push({ arc: [
          { x: -xA, y: yA },
          { x: -xA, y: yB }
        ] });
        if (yB) {
          path.push({ x: -xA, y: -yB });
        }
        path.push({ arc: [
          { x: -xA, y: -yA },
          { x: -xB, y: -yA }
        ] });
        if (xB) {
          path.push({ x: xB, y: -yA });
        }
        this.path = path;
      };
      return RoundedRect;
    });
  }
});

// package/js/ellipse.js
var require_ellipse = __commonJS({
  "package/js/ellipse.js"(exports, module) {
    (function(root, factory) {
      if (typeof module == "object" && module.exports) {
        module.exports = factory(require_shape());
      } else {
        var Zdog = root.Zdog;
        Zdog.Ellipse = factory(Zdog.Shape);
      }
    })(exports, function factory(Shape) {
      var Ellipse = Shape.subclass({
        diameter: 1,
        width: void 0,
        height: void 0,
        quarters: 4,
        closed: false
      });
      Ellipse.prototype.setPath = function() {
        var width = this.width != void 0 ? this.width : this.diameter;
        var height = this.height != void 0 ? this.height : this.diameter;
        var x = width / 2;
        var y = height / 2;
        this.path = [
          { x: 0, y: -y },
          { arc: [
            // top right
            { x, y: -y },
            { x, y: 0 }
          ] }
        ];
        if (this.quarters > 1) {
          this.path.push({ arc: [
            { x, y },
            { x: 0, y }
          ] });
        }
        if (this.quarters > 2) {
          this.path.push({ arc: [
            { x: -x, y },
            { x: -x, y: 0 }
          ] });
        }
        if (this.quarters > 3) {
          this.path.push({ arc: [
            { x: -x, y: -y },
            { x: 0, y: -y }
          ] });
        }
      };
      return Ellipse;
    });
  }
});

// package/js/polygon.js
var require_polygon = __commonJS({
  "package/js/polygon.js"(exports, module) {
    (function(root, factory) {
      if (typeof module == "object" && module.exports) {
        module.exports = factory(require_boilerplate(), require_shape());
      } else {
        var Zdog = root.Zdog;
        Zdog.Polygon = factory(Zdog, Zdog.Shape);
      }
    })(exports, function factory(utils, Shape) {
      var Polygon = Shape.subclass({
        sides: 3,
        radius: 0.5
      });
      var TAU = utils.TAU;
      Polygon.prototype.setPath = function() {
        this.path = [];
        for (var i = 0; i < this.sides; i++) {
          var theta = i / this.sides * TAU - TAU / 4;
          var x = Math.cos(theta) * this.radius;
          var y = Math.sin(theta) * this.radius;
          this.path.push({ x, y });
        }
      };
      return Polygon;
    });
  }
});

// package/js/hemisphere.js
var require_hemisphere = __commonJS({
  "package/js/hemisphere.js"(exports, module) {
    (function(root, factory) {
      if (typeof module == "object" && module.exports) {
        module.exports = factory(
          require_boilerplate(),
          require_vector(),
          require_anchor(),
          require_ellipse()
        );
      } else {
        var Zdog = root.Zdog;
        Zdog.Hemisphere = factory(Zdog, Zdog.Vector, Zdog.Anchor, Zdog.Ellipse);
      }
    })(exports, function factory(utils, Vector, Anchor, Ellipse) {
      var Hemisphere = Ellipse.subclass({
        fill: true
      });
      var TAU = utils.TAU;
      Hemisphere.prototype.create = function() {
        Ellipse.prototype.create.apply(this, arguments);
        this.apex = new Anchor({
          addTo: this,
          translate: { z: this.diameter / 2 }
        });
        this.renderCentroid = new Vector();
      };
      Hemisphere.prototype.updateSortValue = function() {
        this.renderCentroid.set(this.renderOrigin).lerp(this.apex.renderOrigin, 3 / 8);
        this.sortValue = this.renderCentroid.z;
      };
      Hemisphere.prototype.render = function(ctx, renderer) {
        this.renderDome(ctx, renderer);
        Ellipse.prototype.render.apply(this, arguments);
      };
      Hemisphere.prototype.renderDome = function(ctx, renderer) {
        if (!this.visible) {
          return;
        }
        var elem = this.getDomeRenderElement(ctx, renderer);
        var contourAngle = Math.atan2(this.renderNormal.y, this.renderNormal.x);
        var domeRadius = this.diameter / 2 * this.renderNormal.magnitude();
        var x = this.renderOrigin.x;
        var y = this.renderOrigin.y;
        if (renderer.isCanvas) {
          var startAngle = contourAngle + TAU / 4;
          var endAngle = contourAngle - TAU / 4;
          ctx.beginPath();
          ctx.arc(x, y, domeRadius, startAngle, endAngle);
        } else if (renderer.isSvg) {
          contourAngle = (contourAngle - TAU / 4) / TAU * 360;
          this.domeSvgElement.setAttribute("d", "M " + -domeRadius + ",0 A " + domeRadius + "," + domeRadius + " 0 0 1 " + domeRadius + ",0");
          this.domeSvgElement.setAttribute(
            "transform",
            "translate(" + x + "," + y + " ) rotate(" + contourAngle + ")"
          );
        }
        renderer.stroke(ctx, elem, this.stroke, this.color, this.getLineWidth());
        renderer.fill(ctx, elem, this.fill, this.color);
        renderer.end(ctx, elem);
      };
      var svgURI = "http://www.w3.org/2000/svg";
      Hemisphere.prototype.getDomeRenderElement = function(ctx, renderer) {
        if (!renderer.isSvg) {
          return;
        }
        if (!this.domeSvgElement) {
          this.domeSvgElement = document.createElementNS(svgURI, "path");
          this.domeSvgElement.setAttribute("stroke-linecap", "round");
          this.domeSvgElement.setAttribute("stroke-linejoin", "round");
        }
        return this.domeSvgElement;
      };
      return Hemisphere;
    });
  }
});

// package/js/cylinder.js
var require_cylinder = __commonJS({
  "package/js/cylinder.js"(exports, module) {
    (function(root, factory) {
      if (typeof module == "object" && module.exports) {
        module.exports = factory(
          require_boilerplate(),
          require_path_command(),
          require_shape(),
          require_group(),
          require_ellipse()
        );
      } else {
        var Zdog = root.Zdog;
        Zdog.Cylinder = factory(
          Zdog,
          Zdog.PathCommand,
          Zdog.Shape,
          Zdog.Group,
          Zdog.Ellipse
        );
      }
    })(exports, function factory(utils, PathCommand, Shape, Group, Ellipse) {
      function noop() {
      }
      var CylinderGroup = Group.subclass({
        color: "#333",
        updateSort: true
      });
      CylinderGroup.prototype.create = function() {
        Group.prototype.create.apply(this, arguments);
        this.pathCommands = [
          new PathCommand("move", [{}]),
          new PathCommand("line", [{}])
        ];
      };
      CylinderGroup.prototype.render = function(ctx, renderer) {
        this.renderCylinderSurface(ctx, renderer);
        Group.prototype.render.apply(this, arguments);
      };
      CylinderGroup.prototype.renderCylinderSurface = function(ctx, renderer) {
        if (!this.visible) {
          return;
        }
        var elem = this.getRenderElement(ctx, renderer);
        var frontBase = this.frontBase;
        var rearBase = this.rearBase;
        var scale = frontBase.renderNormal.magnitude();
        var strokeWidth = frontBase.diameter * scale + frontBase.getLineWidth();
        this.pathCommands[0].renderPoints[0].set(frontBase.renderOrigin);
        this.pathCommands[1].renderPoints[0].set(rearBase.renderOrigin);
        if (renderer.isCanvas) {
          ctx.lineCap = "butt";
        }
        renderer.renderPath(ctx, elem, this.pathCommands);
        renderer.stroke(ctx, elem, true, this.color, strokeWidth);
        renderer.end(ctx, elem);
        if (renderer.isCanvas) {
          ctx.lineCap = "round";
        }
      };
      var svgURI = "http://www.w3.org/2000/svg";
      CylinderGroup.prototype.getRenderElement = function(ctx, renderer) {
        if (!renderer.isSvg) {
          return;
        }
        if (!this.svgElement) {
          this.svgElement = document.createElementNS(svgURI, "path");
        }
        return this.svgElement;
      };
      CylinderGroup.prototype.copyGraph = noop;
      var CylinderEllipse = Ellipse.subclass();
      CylinderEllipse.prototype.copyGraph = noop;
      var Cylinder = Shape.subclass({
        diameter: 1,
        length: 1,
        frontFace: void 0,
        fill: true
      });
      var TAU = utils.TAU;
      Cylinder.prototype.create = function() {
        Shape.prototype.create.apply(this, arguments);
        this.group = new CylinderGroup({
          addTo: this,
          color: this.color,
          visible: this.visible
        });
        var baseZ = this.length / 2;
        var baseColor = this.backface || true;
        this.frontBase = this.group.frontBase = new Ellipse({
          addTo: this.group,
          diameter: this.diameter,
          translate: { z: baseZ },
          rotate: { y: TAU / 2 },
          color: this.color,
          stroke: this.stroke,
          fill: this.fill,
          backface: this.frontFace || baseColor,
          visible: this.visible
        });
        this.rearBase = this.group.rearBase = this.frontBase.copy({
          translate: { z: -baseZ },
          rotate: { y: 0 },
          backface: baseColor
        });
      };
      Cylinder.prototype.render = function() {
      };
      var childProperties = ["stroke", "fill", "color", "visible"];
      childProperties.forEach(function(property) {
        var _prop = "_" + property;
        Object.defineProperty(Cylinder.prototype, property, {
          get: function() {
            return this[_prop];
          },
          set: function(value) {
            this[_prop] = value;
            if (this.frontBase) {
              this.frontBase[property] = value;
              this.rearBase[property] = value;
              this.group[property] = value;
            }
          }
        });
      });
      return Cylinder;
    });
  }
});

// package/js/cone.js
var require_cone = __commonJS({
  "package/js/cone.js"(exports, module) {
    (function(root, factory) {
      if (typeof module == "object" && module.exports) {
        module.exports = factory(
          require_boilerplate(),
          require_vector(),
          require_path_command(),
          require_anchor(),
          require_ellipse()
        );
      } else {
        var Zdog = root.Zdog;
        Zdog.Cone = factory(
          Zdog,
          Zdog.Vector,
          Zdog.PathCommand,
          Zdog.Anchor,
          Zdog.Ellipse
        );
      }
    })(exports, function factory(utils, Vector, PathCommand, Anchor, Ellipse) {
      var Cone = Ellipse.subclass({
        length: 1,
        fill: true
      });
      var TAU = utils.TAU;
      Cone.prototype.create = function() {
        Ellipse.prototype.create.apply(this, arguments);
        this.apex = new Anchor({
          addTo: this,
          translate: { z: this.length }
        });
        this.renderApex = new Vector();
        this.renderCentroid = new Vector();
        this.tangentA = new Vector();
        this.tangentB = new Vector();
        this.surfacePathCommands = [
          new PathCommand("move", [{}]),
          // points set in renderConeSurface
          new PathCommand("line", [{}]),
          new PathCommand("line", [{}])
        ];
      };
      Cone.prototype.updateSortValue = function() {
        this.renderCentroid.set(this.renderOrigin).lerp(this.apex.renderOrigin, 1 / 3);
        this.sortValue = this.renderCentroid.z;
      };
      Cone.prototype.render = function(ctx, renderer) {
        this.renderConeSurface(ctx, renderer);
        Ellipse.prototype.render.apply(this, arguments);
      };
      Cone.prototype.renderConeSurface = function(ctx, renderer) {
        if (!this.visible) {
          return;
        }
        this.renderApex.set(this.apex.renderOrigin).subtract(this.renderOrigin);
        var scale = this.renderNormal.magnitude();
        var apexDistance = this.renderApex.magnitude2d();
        var normalDistance = this.renderNormal.magnitude2d();
        var eccenAngle = Math.acos(normalDistance / scale);
        var eccen = Math.sin(eccenAngle);
        var radius = this.diameter / 2 * scale;
        var isApexVisible = radius * eccen < apexDistance;
        if (!isApexVisible) {
          return;
        }
        var apexAngle = Math.atan2(this.renderNormal.y, this.renderNormal.x) + TAU / 2;
        var projectLength = apexDistance / eccen;
        var projectAngle = Math.acos(radius / projectLength);
        var tangentA = this.tangentA;
        var tangentB = this.tangentB;
        tangentA.x = Math.cos(projectAngle) * radius * eccen;
        tangentA.y = Math.sin(projectAngle) * radius;
        tangentB.set(this.tangentA);
        tangentB.y *= -1;
        tangentA.rotateZ(apexAngle);
        tangentB.rotateZ(apexAngle);
        tangentA.add(this.renderOrigin);
        tangentB.add(this.renderOrigin);
        this.setSurfaceRenderPoint(0, tangentA);
        this.setSurfaceRenderPoint(1, this.apex.renderOrigin);
        this.setSurfaceRenderPoint(2, tangentB);
        var elem = this.getSurfaceRenderElement(ctx, renderer);
        renderer.renderPath(ctx, elem, this.surfacePathCommands);
        renderer.stroke(ctx, elem, this.stroke, this.color, this.getLineWidth());
        renderer.fill(ctx, elem, this.fill, this.color);
        renderer.end(ctx, elem);
      };
      var svgURI = "http://www.w3.org/2000/svg";
      Cone.prototype.getSurfaceRenderElement = function(ctx, renderer) {
        if (!renderer.isSvg) {
          return;
        }
        if (!this.surfaceSvgElement) {
          this.surfaceSvgElement = document.createElementNS(svgURI, "path");
          this.surfaceSvgElement.setAttribute("stroke-linecap", "round");
          this.surfaceSvgElement.setAttribute("stroke-linejoin", "round");
        }
        return this.surfaceSvgElement;
      };
      Cone.prototype.setSurfaceRenderPoint = function(index, point) {
        var renderPoint = this.surfacePathCommands[index].renderPoints[0];
        renderPoint.set(point);
      };
      return Cone;
    });
  }
});

// package/js/box.js
var require_box = __commonJS({
  "package/js/box.js"(exports, module) {
    (function(root, factory) {
      if (typeof module == "object" && module.exports) {
        module.exports = factory(
          require_boilerplate(),
          require_anchor(),
          require_shape(),
          require_rect()
        );
      } else {
        var Zdog = root.Zdog;
        Zdog.Box = factory(Zdog, Zdog.Anchor, Zdog.Shape, Zdog.Rect);
      }
    })(exports, function factory(utils, Anchor, Shape, Rect) {
      var BoxRect = Rect.subclass();
      BoxRect.prototype.copyGraph = function() {
      };
      var TAU = utils.TAU;
      var faceNames = [
        "frontFace",
        "rearFace",
        "leftFace",
        "rightFace",
        "topFace",
        "bottomFace"
      ];
      var boxDefaults = utils.extend({}, Shape.defaults);
      delete boxDefaults.path;
      faceNames.forEach(function(faceName) {
        boxDefaults[faceName] = true;
      });
      utils.extend(boxDefaults, {
        width: 1,
        height: 1,
        depth: 1,
        fill: true
      });
      var Box = Anchor.subclass(boxDefaults);
      Box.prototype.create = function(options) {
        Anchor.prototype.create.call(this, options);
        this.updatePath();
        this.fill = this.fill;
      };
      Box.prototype.updatePath = function() {
        faceNames.forEach(function(faceName) {
          this[faceName] = this[faceName];
        }, this);
      };
      faceNames.forEach(function(faceName) {
        var _faceName = "_" + faceName;
        Object.defineProperty(Box.prototype, faceName, {
          get: function() {
            return this[_faceName];
          },
          set: function(value) {
            this[_faceName] = value;
            this.setFace(faceName, value);
          }
        });
      });
      Box.prototype.setFace = function(faceName, value) {
        var rectProperty = faceName + "Rect";
        var rect = this[rectProperty];
        if (!value) {
          this.removeChild(rect);
          return;
        }
        var options = this.getFaceOptions(faceName);
        options.color = typeof value == "string" ? value : this.color;
        if (rect) {
          rect.setOptions(options);
        } else {
          rect = this[rectProperty] = new BoxRect(options);
        }
        rect.updatePath();
        this.addChild(rect);
      };
      Box.prototype.getFaceOptions = function(faceName) {
        return {
          frontFace: {
            width: this.width,
            height: this.height,
            translate: { z: this.depth / 2 }
          },
          rearFace: {
            width: this.width,
            height: this.height,
            translate: { z: -this.depth / 2 },
            rotate: { y: TAU / 2 }
          },
          leftFace: {
            width: this.depth,
            height: this.height,
            translate: { x: -this.width / 2 },
            rotate: { y: -TAU / 4 }
          },
          rightFace: {
            width: this.depth,
            height: this.height,
            translate: { x: this.width / 2 },
            rotate: { y: TAU / 4 }
          },
          topFace: {
            width: this.width,
            height: this.depth,
            translate: { y: -this.height / 2 },
            rotate: { x: -TAU / 4 }
          },
          bottomFace: {
            width: this.width,
            height: this.depth,
            translate: { y: this.height / 2 },
            rotate: { x: TAU / 4 }
          }
        }[faceName];
      };
      var childProperties = [
        "color",
        "stroke",
        "fill",
        "backface",
        "front",
        "visible"
      ];
      childProperties.forEach(function(property) {
        var _prop = "_" + property;
        Object.defineProperty(Box.prototype, property, {
          get: function() {
            return this[_prop];
          },
          set: function(value) {
            this[_prop] = value;
            faceNames.forEach(function(faceName) {
              var rect = this[faceName + "Rect"];
              var isFaceColor = typeof this[faceName] == "string";
              var isColorUnderwrite = property == "color" && isFaceColor;
              if (rect && !isColorUnderwrite) {
                rect[property] = value;
              }
            }, this);
          }
        });
      });
      return Box;
    });
  }
});

// package/js/index.js
var require_index = __commonJS({
  "package/js/index.js"(exports, module) {
    (function(root, factory) {
      if (typeof module == "object" && module.exports) {
        module.exports = factory(
          require_boilerplate(),
          require_canvas_renderer(),
          require_svg_renderer(),
          require_vector(),
          require_anchor(),
          require_dragger(),
          require_illustration(),
          require_path_command(),
          require_shape(),
          require_group(),
          require_rect(),
          require_rounded_rect(),
          require_ellipse(),
          require_polygon(),
          require_hemisphere(),
          require_cylinder(),
          require_cone(),
          require_box()
        );
      } else if (typeof define == "function" && define.amd) {
        define("zdog", [], root.Zdog);
      }
    })(exports, function factory(Zdog, CanvasRenderer, SvgRenderer, Vector, Anchor, Dragger, Illustration, PathCommand, Shape, Group, Rect, RoundedRect, Ellipse, Polygon, Hemisphere, Cylinder, Cone, Box) {
      Zdog.CanvasRenderer = CanvasRenderer;
      Zdog.SvgRenderer = SvgRenderer;
      Zdog.Vector = Vector;
      Zdog.Anchor = Anchor;
      Zdog.Dragger = Dragger;
      Zdog.Illustration = Illustration;
      Zdog.PathCommand = PathCommand;
      Zdog.Shape = Shape;
      Zdog.Group = Group;
      Zdog.Rect = Rect;
      Zdog.RoundedRect = RoundedRect;
      Zdog.Ellipse = Ellipse;
      Zdog.Polygon = Polygon;
      Zdog.Hemisphere = Hemisphere;
      Zdog.Cylinder = Cylinder;
      Zdog.Cone = Cone;
      Zdog.Box = Box;
      return Zdog;
    });
  }
});
export default require_index();
/*!
 * Zdog v1.1.3
 * Round, flat, designer-friendly pseudo-3D engine
 * Licensed MIT
 * https://zzz.dog
 * Copyright 2020 Metafizzy
 */
