(function () {
    'use strict';

    function noop() { }
    function assign(tar, src) {
        // @ts-ignore
        for (const k in src)
            tar[k] = src[k];
        return tar;
    }
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }
    function validate_store(store, name) {
        if (store != null && typeof store.subscribe !== 'function') {
            throw new Error(`'${name}' is not a store with a 'subscribe' method`);
        }
    }
    function subscribe(store, ...callbacks) {
        if (store == null) {
            return noop;
        }
        const unsub = store.subscribe(...callbacks);
        return unsub.unsubscribe ? () => unsub.unsubscribe() : unsub;
    }
    function component_subscribe(component, store, callback) {
        component.$$.on_destroy.push(subscribe(store, callback));
    }
    function create_slot(definition, ctx, $$scope, fn) {
        if (definition) {
            const slot_ctx = get_slot_context(definition, ctx, $$scope, fn);
            return definition[0](slot_ctx);
        }
    }
    function get_slot_context(definition, ctx, $$scope, fn) {
        return definition[1] && fn
            ? assign($$scope.ctx.slice(), definition[1](fn(ctx)))
            : $$scope.ctx;
    }
    function get_slot_changes(definition, $$scope, dirty, fn) {
        if (definition[2] && fn) {
            const lets = definition[2](fn(dirty));
            if ($$scope.dirty === undefined) {
                return lets;
            }
            if (typeof lets === 'object') {
                const merged = [];
                const len = Math.max($$scope.dirty.length, lets.length);
                for (let i = 0; i < len; i += 1) {
                    merged[i] = $$scope.dirty[i] | lets[i];
                }
                return merged;
            }
            return $$scope.dirty | lets;
        }
        return $$scope.dirty;
    }
    function update_slot(slot, slot_definition, ctx, $$scope, dirty, get_slot_changes_fn, get_slot_context_fn) {
        const slot_changes = get_slot_changes(slot_definition, $$scope, dirty, get_slot_changes_fn);
        if (slot_changes) {
            const slot_context = get_slot_context(slot_definition, ctx, $$scope, get_slot_context_fn);
            slot.p(slot_context, slot_changes);
        }
    }
    function exclude_internal_props(props) {
        const result = {};
        for (const k in props)
            if (k[0] !== '$')
                result[k] = props[k];
        return result;
    }
    function compute_rest_props(props, keys) {
        const rest = {};
        keys = new Set(keys);
        for (const k in props)
            if (!keys.has(k) && k[0] !== '$')
                rest[k] = props[k];
        return rest;
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function destroy_each(iterations, detaching) {
        for (let i = 0; i < iterations.length; i += 1) {
            if (iterations[i])
                iterations[i].d(detaching);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function set_attributes(node, attributes) {
        // @ts-ignore
        const descriptors = Object.getOwnPropertyDescriptors(node.__proto__);
        for (const key in attributes) {
            if (attributes[key] == null) {
                node.removeAttribute(key);
            }
            else if (key === 'style') {
                node.style.cssText = attributes[key];
            }
            else if (key === '__value') {
                node.value = node[key] = attributes[key];
            }
            else if (descriptors[key] && descriptors[key].set) {
                node[key] = attributes[key];
            }
            else {
                attr(node, key, attributes[key]);
            }
        }
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error('Function called outside component initialization');
        return current_component;
    }
    function beforeUpdate(fn) {
        get_current_component().$$.before_update.push(fn);
    }
    function onMount(fn) {
        get_current_component().$$.on_mount.push(fn);
    }
    function afterUpdate(fn) {
        get_current_component().$$.after_update.push(fn);
    }
    function onDestroy(fn) {
        get_current_component().$$.on_destroy.push(fn);
    }
    function createEventDispatcher() {
        const component = get_current_component();
        return (type, detail) => {
            const callbacks = component.$$.callbacks[type];
            if (callbacks) {
                // TODO are there situations where events could be dispatched
                // in a server (non-DOM) environment?
                const event = custom_event(type, detail);
                callbacks.slice().forEach(fn => {
                    fn.call(component, event);
                });
            }
        };
    }
    function setContext(key, context) {
        get_current_component().$$.context.set(key, context);
    }
    function getContext(key) {
        return get_current_component().$$.context.get(key);
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            set_current_component(null);
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }

    function get_spread_update(levels, updates) {
        const update = {};
        const to_null_out = {};
        const accounted_for = { $$scope: 1 };
        let i = levels.length;
        while (i--) {
            const o = levels[i];
            const n = updates[i];
            if (n) {
                for (const key in o) {
                    if (!(key in n))
                        to_null_out[key] = 1;
                }
                for (const key in n) {
                    if (!accounted_for[key]) {
                        update[key] = n[key];
                        accounted_for[key] = 1;
                    }
                }
                levels[i] = n;
            }
            else {
                for (const key in o) {
                    accounted_for[key] = 1;
                }
            }
        }
        for (const key in to_null_out) {
            if (!(key in update))
                update[key] = undefined;
        }
        return update;
    }
    function get_spread_object(spread_props) {
        return typeof spread_props === 'object' && spread_props !== null ? spread_props : {};
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor, customElement) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        if (!customElement) {
            // onMount happens before the initial afterUpdate
            add_render_callback(() => {
                const new_on_destroy = on_mount.map(run).filter(is_function);
                if (on_destroy) {
                    on_destroy.push(...new_on_destroy);
                }
                else {
                    // Edge case - component was destroyed immediately,
                    // most likely as a result of a binding initialising
                    run_all(new_on_destroy);
                }
                component.$$.on_mount = [];
            });
        }
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            on_disconnect: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, options.props || {}, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor, options.customElement);
            flush();
        }
        set_current_component(parent_component);
    }
    /**
     * Base class for Svelte components. Used when dev=false.
     */
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, Object.assign({ version: '3.35.0' }, detail)));
    }
    function append_dev(target, node) {
        dispatch_dev('SvelteDOMInsert', { target, node });
        append(target, node);
    }
    function insert_dev(target, node, anchor) {
        dispatch_dev('SvelteDOMInsert', { target, node, anchor });
        insert(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev('SvelteDOMRemove', { node });
        detach(node);
    }
    function listen_dev(node, event, handler, options, has_prevent_default, has_stop_propagation) {
        const modifiers = options === true ? ['capture'] : options ? Array.from(Object.keys(options)) : [];
        if (has_prevent_default)
            modifiers.push('preventDefault');
        if (has_stop_propagation)
            modifiers.push('stopPropagation');
        dispatch_dev('SvelteDOMAddEventListener', { node, event, handler, modifiers });
        const dispose = listen(node, event, handler, options);
        return () => {
            dispatch_dev('SvelteDOMRemoveEventListener', { node, event, handler, modifiers });
            dispose();
        };
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev('SvelteDOMRemoveAttribute', { node, attribute });
        else
            dispatch_dev('SvelteDOMSetAttribute', { node, attribute, value });
    }
    function prop_dev(node, property, value) {
        node[property] = value;
        dispatch_dev('SvelteDOMSetProperty', { node, property, value });
    }
    function set_data_dev(text, data) {
        data = '' + data;
        if (text.wholeText === data)
            return;
        dispatch_dev('SvelteDOMSetData', { node: text, data });
        text.data = data;
    }
    function validate_each_argument(arg) {
        if (typeof arg !== 'string' && !(arg && typeof arg === 'object' && 'length' in arg)) {
            let msg = '{#each} only iterates over array-like objects.';
            if (typeof Symbol === 'function' && arg && Symbol.iterator in arg) {
                msg += ' You can use a spread to convert this iterable into an array.';
            }
            throw new Error(msg);
        }
    }
    function validate_slots(name, slot, keys) {
        for (const slot_key of Object.keys(slot)) {
            if (!~keys.indexOf(slot_key)) {
                console.warn(`<${name}> received an unexpected slot "${slot_key}".`);
            }
        }
    }
    /**
     * Base class for Svelte components with some minor dev-enhancements. Used when dev=true.
     */
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error("'target' is a required option");
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn('Component was already destroyed'); // eslint-disable-line no-console
            };
        }
        $capture_state() { }
        $inject_state() { }
    }

    const subscriber_queue = [];
    /**
     * Creates a `Readable` store that allows reading by subscription.
     * @param value initial value
     * @param {StartStopNotifier}start start and stop notifications for subscriptions
     */
    function readable(value, start) {
        return {
            subscribe: writable(value, start).subscribe
        };
    }
    /**
     * Create a `Writable` store that allows both updating and reading by subscription.
     * @param {*=}value initial value
     * @param {StartStopNotifier=}start start and stop notifications for subscriptions
     */
    function writable(value, start = noop) {
        let stop;
        const subscribers = [];
        function set(new_value) {
            if (safe_not_equal(value, new_value)) {
                value = new_value;
                if (stop) { // store is ready
                    const run_queue = !subscriber_queue.length;
                    for (let i = 0; i < subscribers.length; i += 1) {
                        const s = subscribers[i];
                        s[1]();
                        subscriber_queue.push(s, value);
                    }
                    if (run_queue) {
                        for (let i = 0; i < subscriber_queue.length; i += 2) {
                            subscriber_queue[i][0](subscriber_queue[i + 1]);
                        }
                        subscriber_queue.length = 0;
                    }
                }
            }
        }
        function update(fn) {
            set(fn(value));
        }
        function subscribe(run, invalidate = noop) {
            const subscriber = [run, invalidate];
            subscribers.push(subscriber);
            if (subscribers.length === 1) {
                stop = start(set) || noop;
            }
            run(value);
            return () => {
                const index = subscribers.indexOf(subscriber);
                if (index !== -1) {
                    subscribers.splice(index, 1);
                }
                if (subscribers.length === 0) {
                    stop();
                    stop = null;
                }
            };
        }
        return { set, update, subscribe };
    }
    function derived(stores, fn, initial_value) {
        const single = !Array.isArray(stores);
        const stores_array = single
            ? [stores]
            : stores;
        const auto = fn.length < 2;
        return readable(initial_value, (set) => {
            let inited = false;
            const values = [];
            let pending = 0;
            let cleanup = noop;
            const sync = () => {
                if (pending) {
                    return;
                }
                cleanup();
                const result = fn(single ? values[0] : values, set);
                if (auto) {
                    set(result);
                }
                else {
                    cleanup = is_function(result) ? result : noop;
                }
            };
            const unsubscribers = stores_array.map((store, i) => subscribe(store, (value) => {
                values[i] = value;
                pending &= ~(1 << i);
                if (inited) {
                    sync();
                }
            }, () => {
                pending |= (1 << i);
            }));
            inited = true;
            sync();
            return function stop() {
                run_all(unsubscribers);
                cleanup();
            };
        });
    }

    const LOCATION = {};
    const ROUTER = {};

    /**
     * Adapted from https://github.com/reach/router/blob/b60e6dd781d5d3a4bdaaf4de665649c0f6a7e78d/src/lib/history.js
     *
     * https://github.com/reach/router/blob/master/LICENSE
     * */

    function getLocation(source) {
      return {
        ...source.location,
        state: source.history.state,
        key: (source.history.state && source.history.state.key) || "initial"
      };
    }

    function createHistory(source, options) {
      const listeners = [];
      let location = getLocation(source);

      return {
        get location() {
          return location;
        },

        listen(listener) {
          listeners.push(listener);

          const popstateListener = () => {
            location = getLocation(source);
            listener({ location, action: "POP" });
          };

          source.addEventListener("popstate", popstateListener);

          return () => {
            source.removeEventListener("popstate", popstateListener);

            const index = listeners.indexOf(listener);
            listeners.splice(index, 1);
          };
        },

        navigate(to, { state, replace = false } = {}) {
          state = { ...state, key: Date.now() + "" };
          // try...catch iOS Safari limits to 100 pushState calls
          try {
            if (replace) {
              source.history.replaceState(state, null, to);
            } else {
              source.history.pushState(state, null, to);
            }
          } catch (e) {
            source.location[replace ? "replace" : "assign"](to);
          }

          location = getLocation(source);
          listeners.forEach(listener => listener({ location, action: "PUSH" }));
        }
      };
    }

    // Stores history entries in memory for testing or other platforms like Native
    function createMemorySource(initialPathname = "/") {
      let index = 0;
      const stack = [{ pathname: initialPathname, search: "" }];
      const states = [];

      return {
        get location() {
          return stack[index];
        },
        addEventListener(name, fn) {},
        removeEventListener(name, fn) {},
        history: {
          get entries() {
            return stack;
          },
          get index() {
            return index;
          },
          get state() {
            return states[index];
          },
          pushState(state, _, uri) {
            const [pathname, search = ""] = uri.split("?");
            index++;
            stack.push({ pathname, search });
            states.push(state);
          },
          replaceState(state, _, uri) {
            const [pathname, search = ""] = uri.split("?");
            stack[index] = { pathname, search };
            states[index] = state;
          }
        }
      };
    }

    // Global history uses window.history as the source if available,
    // otherwise a memory history
    const canUseDOM = Boolean(
      typeof window !== "undefined" &&
        window.document &&
        window.document.createElement
    );
    const globalHistory = createHistory(canUseDOM ? window : createMemorySource());
    const { navigate } = globalHistory;

    /**
     * Adapted from https://github.com/reach/router/blob/b60e6dd781d5d3a4bdaaf4de665649c0f6a7e78d/src/lib/utils.js
     *
     * https://github.com/reach/router/blob/master/LICENSE
     * */

    const paramRe = /^:(.+)/;

    const SEGMENT_POINTS = 4;
    const STATIC_POINTS = 3;
    const DYNAMIC_POINTS = 2;
    const SPLAT_PENALTY = 1;
    const ROOT_POINTS = 1;

    /**
     * Check if `string` starts with `search`
     * @param {string} string
     * @param {string} search
     * @return {boolean}
     */
    function startsWith(string, search) {
      return string.substr(0, search.length) === search;
    }

    /**
     * Check if `segment` is a root segment
     * @param {string} segment
     * @return {boolean}
     */
    function isRootSegment(segment) {
      return segment === "";
    }

    /**
     * Check if `segment` is a dynamic segment
     * @param {string} segment
     * @return {boolean}
     */
    function isDynamic(segment) {
      return paramRe.test(segment);
    }

    /**
     * Check if `segment` is a splat
     * @param {string} segment
     * @return {boolean}
     */
    function isSplat(segment) {
      return segment[0] === "*";
    }

    /**
     * Split up the URI into segments delimited by `/`
     * @param {string} uri
     * @return {string[]}
     */
    function segmentize(uri) {
      return (
        uri
          // Strip starting/ending `/`
          .replace(/(^\/+|\/+$)/g, "")
          .split("/")
      );
    }

    /**
     * Strip `str` of potential start and end `/`
     * @param {string} str
     * @return {string}
     */
    function stripSlashes(str) {
      return str.replace(/(^\/+|\/+$)/g, "");
    }

    /**
     * Score a route depending on how its individual segments look
     * @param {object} route
     * @param {number} index
     * @return {object}
     */
    function rankRoute(route, index) {
      const score = route.default
        ? 0
        : segmentize(route.path).reduce((score, segment) => {
            score += SEGMENT_POINTS;

            if (isRootSegment(segment)) {
              score += ROOT_POINTS;
            } else if (isDynamic(segment)) {
              score += DYNAMIC_POINTS;
            } else if (isSplat(segment)) {
              score -= SEGMENT_POINTS + SPLAT_PENALTY;
            } else {
              score += STATIC_POINTS;
            }

            return score;
          }, 0);

      return { route, score, index };
    }

    /**
     * Give a score to all routes and sort them on that
     * @param {object[]} routes
     * @return {object[]}
     */
    function rankRoutes(routes) {
      return (
        routes
          .map(rankRoute)
          // If two routes have the exact same score, we go by index instead
          .sort((a, b) =>
            a.score < b.score ? 1 : a.score > b.score ? -1 : a.index - b.index
          )
      );
    }

    /**
     * Ranks and picks the best route to match. Each segment gets the highest
     * amount of points, then the type of segment gets an additional amount of
     * points where
     *
     *  static > dynamic > splat > root
     *
     * This way we don't have to worry about the order of our routes, let the
     * computers do it.
     *
     * A route looks like this
     *
     *  { path, default, value }
     *
     * And a returned match looks like:
     *
     *  { route, params, uri }
     *
     * @param {object[]} routes
     * @param {string} uri
     * @return {?object}
     */
    function pick(routes, uri) {
      let match;
      let default_;

      const [uriPathname] = uri.split("?");
      const uriSegments = segmentize(uriPathname);
      const isRootUri = uriSegments[0] === "";
      const ranked = rankRoutes(routes);

      for (let i = 0, l = ranked.length; i < l; i++) {
        const route = ranked[i].route;
        let missed = false;

        if (route.default) {
          default_ = {
            route,
            params: {},
            uri
          };
          continue;
        }

        const routeSegments = segmentize(route.path);
        const params = {};
        const max = Math.max(uriSegments.length, routeSegments.length);
        let index = 0;

        for (; index < max; index++) {
          const routeSegment = routeSegments[index];
          const uriSegment = uriSegments[index];

          if (routeSegment !== undefined && isSplat(routeSegment)) {
            // Hit a splat, just grab the rest, and return a match
            // uri:   /files/documents/work
            // route: /files/* or /files/*splatname
            const splatName = routeSegment === "*" ? "*" : routeSegment.slice(1);

            params[splatName] = uriSegments
              .slice(index)
              .map(decodeURIComponent)
              .join("/");
            break;
          }

          if (uriSegment === undefined) {
            // URI is shorter than the route, no match
            // uri:   /users
            // route: /users/:userId
            missed = true;
            break;
          }

          let dynamicMatch = paramRe.exec(routeSegment);

          if (dynamicMatch && !isRootUri) {
            const value = decodeURIComponent(uriSegment);
            params[dynamicMatch[1]] = value;
          } else if (routeSegment !== uriSegment) {
            // Current segments don't match, not dynamic, not splat, so no match
            // uri:   /users/123/settings
            // route: /users/:id/profile
            missed = true;
            break;
          }
        }

        if (!missed) {
          match = {
            route,
            params,
            uri: "/" + uriSegments.slice(0, index).join("/")
          };
          break;
        }
      }

      return match || default_ || null;
    }

    /**
     * Check if the `path` matches the `uri`.
     * @param {string} path
     * @param {string} uri
     * @return {?object}
     */
    function match(route, uri) {
      return pick([route], uri);
    }

    /**
     * Add the query to the pathname if a query is given
     * @param {string} pathname
     * @param {string} [query]
     * @return {string}
     */
    function addQuery(pathname, query) {
      return pathname + (query ? `?${query}` : "");
    }

    /**
     * Resolve URIs as though every path is a directory, no files. Relative URIs
     * in the browser can feel awkward because not only can you be "in a directory",
     * you can be "at a file", too. For example:
     *
     *  browserSpecResolve('foo', '/bar/') => /bar/foo
     *  browserSpecResolve('foo', '/bar') => /foo
     *
     * But on the command line of a file system, it's not as complicated. You can't
     * `cd` from a file, only directories. This way, links have to know less about
     * their current path. To go deeper you can do this:
     *
     *  <Link to="deeper"/>
     *  // instead of
     *  <Link to=`{${props.uri}/deeper}`/>
     *
     * Just like `cd`, if you want to go deeper from the command line, you do this:
     *
     *  cd deeper
     *  # not
     *  cd $(pwd)/deeper
     *
     * By treating every path as a directory, linking to relative paths should
     * require less contextual information and (fingers crossed) be more intuitive.
     * @param {string} to
     * @param {string} base
     * @return {string}
     */
    function resolve(to, base) {
      // /foo/bar, /baz/qux => /foo/bar
      if (startsWith(to, "/")) {
        return to;
      }

      const [toPathname, toQuery] = to.split("?");
      const [basePathname] = base.split("?");
      const toSegments = segmentize(toPathname);
      const baseSegments = segmentize(basePathname);

      // ?a=b, /users?b=c => /users?a=b
      if (toSegments[0] === "") {
        return addQuery(basePathname, toQuery);
      }

      // profile, /users/789 => /users/789/profile
      if (!startsWith(toSegments[0], ".")) {
        const pathname = baseSegments.concat(toSegments).join("/");

        return addQuery((basePathname === "/" ? "" : "/") + pathname, toQuery);
      }

      // ./       , /users/123 => /users/123
      // ../      , /users/123 => /users
      // ../..    , /users/123 => /
      // ../../one, /a/b/c/d   => /a/b/one
      // .././one , /a/b/c/d   => /a/b/c/one
      const allSegments = baseSegments.concat(toSegments);
      const segments = [];

      allSegments.forEach(segment => {
        if (segment === "..") {
          segments.pop();
        } else if (segment !== ".") {
          segments.push(segment);
        }
      });

      return addQuery("/" + segments.join("/"), toQuery);
    }

    /**
     * Combines the `basepath` and the `path` into one path.
     * @param {string} basepath
     * @param {string} path
     */
    function combinePaths(basepath, path) {
      return `${stripSlashes(
    path === "/" ? basepath : `${stripSlashes(basepath)}/${stripSlashes(path)}`
  )}/`;
    }

    /**
     * Decides whether a given `event` should result in a navigation or not.
     * @param {object} event
     */
    function shouldNavigate(event) {
      return (
        !event.defaultPrevented &&
        event.button === 0 &&
        !(event.metaKey || event.altKey || event.ctrlKey || event.shiftKey)
      );
    }

    /* node_modules\svelte-routing\src\Router.svelte generated by Svelte v3.35.0 */

    function create_fragment(ctx) {
    	let current;
    	const default_slot_template = /*#slots*/ ctx[9].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[8], null);

    	const block = {
    		c: function create() {
    			if (default_slot) default_slot.c();
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			if (default_slot) {
    				default_slot.m(target, anchor);
    			}

    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (default_slot) {
    				if (default_slot.p && dirty & /*$$scope*/ 256) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[8], dirty, null, null);
    				}
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (default_slot) default_slot.d(detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance($$self, $$props, $$invalidate) {
    	let $base;
    	let $location;
    	let $routes;
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Router", slots, ['default']);
    	let { basepath = "/" } = $$props;
    	let { url = null } = $$props;
    	const locationContext = getContext(LOCATION);
    	const routerContext = getContext(ROUTER);
    	const routes = writable([]);
    	validate_store(routes, "routes");
    	component_subscribe($$self, routes, value => $$invalidate(7, $routes = value));
    	const activeRoute = writable(null);
    	let hasActiveRoute = false; // Used in SSR to synchronously set that a Route is active.

    	// If locationContext is not set, this is the topmost Router in the tree.
    	// If the `url` prop is given we force the location to it.
    	const location = locationContext || writable(url ? { pathname: url } : globalHistory.location);

    	validate_store(location, "location");
    	component_subscribe($$self, location, value => $$invalidate(6, $location = value));

    	// If routerContext is set, the routerBase of the parent Router
    	// will be the base for this Router's descendants.
    	// If routerContext is not set, the path and resolved uri will both
    	// have the value of the basepath prop.
    	const base = routerContext
    	? routerContext.routerBase
    	: writable({ path: basepath, uri: basepath });

    	validate_store(base, "base");
    	component_subscribe($$self, base, value => $$invalidate(5, $base = value));

    	const routerBase = derived([base, activeRoute], ([base, activeRoute]) => {
    		// If there is no activeRoute, the routerBase will be identical to the base.
    		if (activeRoute === null) {
    			return base;
    		}

    		const { path: basepath } = base;
    		const { route, uri } = activeRoute;

    		// Remove the potential /* or /*splatname from
    		// the end of the child Routes relative paths.
    		const path = route.default
    		? basepath
    		: route.path.replace(/\*.*$/, "");

    		return { path, uri };
    	});

    	function registerRoute(route) {
    		const { path: basepath } = $base;
    		let { path } = route;

    		// We store the original path in the _path property so we can reuse
    		// it when the basepath changes. The only thing that matters is that
    		// the route reference is intact, so mutation is fine.
    		route._path = path;

    		route.path = combinePaths(basepath, path);

    		if (typeof window === "undefined") {
    			// In SSR we should set the activeRoute immediately if it is a match.
    			// If there are more Routes being registered after a match is found,
    			// we just skip them.
    			if (hasActiveRoute) {
    				return;
    			}

    			const matchingRoute = match(route, $location.pathname);

    			if (matchingRoute) {
    				activeRoute.set(matchingRoute);
    				hasActiveRoute = true;
    			}
    		} else {
    			routes.update(rs => {
    				rs.push(route);
    				return rs;
    			});
    		}
    	}

    	function unregisterRoute(route) {
    		routes.update(rs => {
    			const index = rs.indexOf(route);
    			rs.splice(index, 1);
    			return rs;
    		});
    	}

    	if (!locationContext) {
    		// The topmost Router in the tree is responsible for updating
    		// the location store and supplying it through context.
    		onMount(() => {
    			const unlisten = globalHistory.listen(history => {
    				location.set(history.location);
    			});

    			return unlisten;
    		});

    		setContext(LOCATION, location);
    	}

    	setContext(ROUTER, {
    		activeRoute,
    		base,
    		routerBase,
    		registerRoute,
    		unregisterRoute
    	});

    	const writable_props = ["basepath", "url"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Router> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ("basepath" in $$props) $$invalidate(3, basepath = $$props.basepath);
    		if ("url" in $$props) $$invalidate(4, url = $$props.url);
    		if ("$$scope" in $$props) $$invalidate(8, $$scope = $$props.$$scope);
    	};

    	$$self.$capture_state = () => ({
    		getContext,
    		setContext,
    		onMount,
    		writable,
    		derived,
    		LOCATION,
    		ROUTER,
    		globalHistory,
    		pick,
    		match,
    		stripSlashes,
    		combinePaths,
    		basepath,
    		url,
    		locationContext,
    		routerContext,
    		routes,
    		activeRoute,
    		hasActiveRoute,
    		location,
    		base,
    		routerBase,
    		registerRoute,
    		unregisterRoute,
    		$base,
    		$location,
    		$routes
    	});

    	$$self.$inject_state = $$props => {
    		if ("basepath" in $$props) $$invalidate(3, basepath = $$props.basepath);
    		if ("url" in $$props) $$invalidate(4, url = $$props.url);
    		if ("hasActiveRoute" in $$props) hasActiveRoute = $$props.hasActiveRoute;
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*$base*/ 32) {
    			// This reactive statement will update all the Routes' path when
    			// the basepath changes.
    			 {
    				const { path: basepath } = $base;

    				routes.update(rs => {
    					rs.forEach(r => r.path = combinePaths(basepath, r._path));
    					return rs;
    				});
    			}
    		}

    		if ($$self.$$.dirty & /*$routes, $location*/ 192) {
    			// This reactive statement will be run when the Router is created
    			// when there are no Routes and then again the following tick, so it
    			// will not find an active Route in SSR and in the browser it will only
    			// pick an active Route after all Routes have been registered.
    			 {
    				const bestMatch = pick($routes, $location.pathname);
    				activeRoute.set(bestMatch);
    			}
    		}
    	};

    	return [
    		routes,
    		location,
    		base,
    		basepath,
    		url,
    		$base,
    		$location,
    		$routes,
    		$$scope,
    		slots
    	];
    }

    class Router extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment, safe_not_equal, { basepath: 3, url: 4 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Router",
    			options,
    			id: create_fragment.name
    		});
    	}

    	get basepath() {
    		throw new Error("<Router>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set basepath(value) {
    		throw new Error("<Router>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get url() {
    		throw new Error("<Router>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set url(value) {
    		throw new Error("<Router>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* node_modules\svelte-routing\src\Route.svelte generated by Svelte v3.35.0 */

    const get_default_slot_changes = dirty => ({
    	params: dirty & /*routeParams*/ 4,
    	location: dirty & /*$location*/ 16
    });

    const get_default_slot_context = ctx => ({
    	params: /*routeParams*/ ctx[2],
    	location: /*$location*/ ctx[4]
    });

    // (40:0) {#if $activeRoute !== null && $activeRoute.route === route}
    function create_if_block(ctx) {
    	let current_block_type_index;
    	let if_block;
    	let if_block_anchor;
    	let current;
    	const if_block_creators = [create_if_block_1, create_else_block];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*component*/ ctx[0] !== null) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	const block = {
    		c: function create() {
    			if_block.c();
    			if_block_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			if_blocks[current_block_type_index].m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				} else {
    					if_block.p(ctx, dirty);
    				}

    				transition_in(if_block, 1);
    				if_block.m(if_block_anchor.parentNode, if_block_anchor);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if_blocks[current_block_type_index].d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block.name,
    		type: "if",
    		source: "(40:0) {#if $activeRoute !== null && $activeRoute.route === route}",
    		ctx
    	});

    	return block;
    }

    // (43:2) {:else}
    function create_else_block(ctx) {
    	let current;
    	const default_slot_template = /*#slots*/ ctx[10].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[9], get_default_slot_context);

    	const block = {
    		c: function create() {
    			if (default_slot) default_slot.c();
    		},
    		m: function mount(target, anchor) {
    			if (default_slot) {
    				default_slot.m(target, anchor);
    			}

    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (default_slot) {
    				if (default_slot.p && dirty & /*$$scope, routeParams, $location*/ 532) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[9], dirty, get_default_slot_changes, get_default_slot_context);
    				}
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (default_slot) default_slot.d(detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block.name,
    		type: "else",
    		source: "(43:2) {:else}",
    		ctx
    	});

    	return block;
    }

    // (41:2) {#if component !== null}
    function create_if_block_1(ctx) {
    	let switch_instance;
    	let switch_instance_anchor;
    	let current;

    	const switch_instance_spread_levels = [
    		{ location: /*$location*/ ctx[4] },
    		/*routeParams*/ ctx[2],
    		/*routeProps*/ ctx[3]
    	];

    	var switch_value = /*component*/ ctx[0];

    	function switch_props(ctx) {
    		let switch_instance_props = {};

    		for (let i = 0; i < switch_instance_spread_levels.length; i += 1) {
    			switch_instance_props = assign(switch_instance_props, switch_instance_spread_levels[i]);
    		}

    		return {
    			props: switch_instance_props,
    			$$inline: true
    		};
    	}

    	if (switch_value) {
    		switch_instance = new switch_value(switch_props());
    	}

    	const block = {
    		c: function create() {
    			if (switch_instance) create_component(switch_instance.$$.fragment);
    			switch_instance_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			if (switch_instance) {
    				mount_component(switch_instance, target, anchor);
    			}

    			insert_dev(target, switch_instance_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const switch_instance_changes = (dirty & /*$location, routeParams, routeProps*/ 28)
    			? get_spread_update(switch_instance_spread_levels, [
    					dirty & /*$location*/ 16 && { location: /*$location*/ ctx[4] },
    					dirty & /*routeParams*/ 4 && get_spread_object(/*routeParams*/ ctx[2]),
    					dirty & /*routeProps*/ 8 && get_spread_object(/*routeProps*/ ctx[3])
    				])
    			: {};

    			if (switch_value !== (switch_value = /*component*/ ctx[0])) {
    				if (switch_instance) {
    					group_outros();
    					const old_component = switch_instance;

    					transition_out(old_component.$$.fragment, 1, 0, () => {
    						destroy_component(old_component, 1);
    					});

    					check_outros();
    				}

    				if (switch_value) {
    					switch_instance = new switch_value(switch_props());
    					create_component(switch_instance.$$.fragment);
    					transition_in(switch_instance.$$.fragment, 1);
    					mount_component(switch_instance, switch_instance_anchor.parentNode, switch_instance_anchor);
    				} else {
    					switch_instance = null;
    				}
    			} else if (switch_value) {
    				switch_instance.$set(switch_instance_changes);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			if (switch_instance) transition_in(switch_instance.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			if (switch_instance) transition_out(switch_instance.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(switch_instance_anchor);
    			if (switch_instance) destroy_component(switch_instance, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1.name,
    		type: "if",
    		source: "(41:2) {#if component !== null}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$1(ctx) {
    	let if_block_anchor;
    	let current;
    	let if_block = /*$activeRoute*/ ctx[1] !== null && /*$activeRoute*/ ctx[1].route === /*route*/ ctx[7] && create_if_block(ctx);

    	const block = {
    		c: function create() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (/*$activeRoute*/ ctx[1] !== null && /*$activeRoute*/ ctx[1].route === /*route*/ ctx[7]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty & /*$activeRoute*/ 2) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$1.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let $activeRoute;
    	let $location;
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Route", slots, ['default']);
    	let { path = "" } = $$props;
    	let { component = null } = $$props;
    	const { registerRoute, unregisterRoute, activeRoute } = getContext(ROUTER);
    	validate_store(activeRoute, "activeRoute");
    	component_subscribe($$self, activeRoute, value => $$invalidate(1, $activeRoute = value));
    	const location = getContext(LOCATION);
    	validate_store(location, "location");
    	component_subscribe($$self, location, value => $$invalidate(4, $location = value));

    	const route = {
    		path,
    		// If no path prop is given, this Route will act as the default Route
    		// that is rendered if no other Route in the Router is a match.
    		default: path === ""
    	};

    	let routeParams = {};
    	let routeProps = {};
    	registerRoute(route);

    	// There is no need to unregister Routes in SSR since it will all be
    	// thrown away anyway.
    	if (typeof window !== "undefined") {
    		onDestroy(() => {
    			unregisterRoute(route);
    		});
    	}

    	$$self.$$set = $$new_props => {
    		$$invalidate(13, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		if ("path" in $$new_props) $$invalidate(8, path = $$new_props.path);
    		if ("component" in $$new_props) $$invalidate(0, component = $$new_props.component);
    		if ("$$scope" in $$new_props) $$invalidate(9, $$scope = $$new_props.$$scope);
    	};

    	$$self.$capture_state = () => ({
    		getContext,
    		onDestroy,
    		ROUTER,
    		LOCATION,
    		path,
    		component,
    		registerRoute,
    		unregisterRoute,
    		activeRoute,
    		location,
    		route,
    		routeParams,
    		routeProps,
    		$activeRoute,
    		$location
    	});

    	$$self.$inject_state = $$new_props => {
    		$$invalidate(13, $$props = assign(assign({}, $$props), $$new_props));
    		if ("path" in $$props) $$invalidate(8, path = $$new_props.path);
    		if ("component" in $$props) $$invalidate(0, component = $$new_props.component);
    		if ("routeParams" in $$props) $$invalidate(2, routeParams = $$new_props.routeParams);
    		if ("routeProps" in $$props) $$invalidate(3, routeProps = $$new_props.routeProps);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*$activeRoute*/ 2) {
    			 if ($activeRoute && $activeRoute.route === route) {
    				$$invalidate(2, routeParams = $activeRoute.params);
    			}
    		}

    		 {
    			const { path, component, ...rest } = $$props;
    			$$invalidate(3, routeProps = rest);
    		}
    	};

    	$$props = exclude_internal_props($$props);

    	return [
    		component,
    		$activeRoute,
    		routeParams,
    		routeProps,
    		$location,
    		activeRoute,
    		location,
    		route,
    		path,
    		$$scope,
    		slots
    	];
    }

    class Route extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, { path: 8, component: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Route",
    			options,
    			id: create_fragment$1.name
    		});
    	}

    	get path() {
    		throw new Error("<Route>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set path(value) {
    		throw new Error("<Route>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get component() {
    		throw new Error("<Route>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set component(value) {
    		throw new Error("<Route>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* node_modules\svelte-routing\src\Link.svelte generated by Svelte v3.35.0 */
    const file = "node_modules\\svelte-routing\\src\\Link.svelte";

    function create_fragment$2(ctx) {
    	let a;
    	let current;
    	let mounted;
    	let dispose;
    	const default_slot_template = /*#slots*/ ctx[16].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[15], null);

    	let a_levels = [
    		{ href: /*href*/ ctx[0] },
    		{ "aria-current": /*ariaCurrent*/ ctx[2] },
    		/*props*/ ctx[1],
    		/*$$restProps*/ ctx[6]
    	];

    	let a_data = {};

    	for (let i = 0; i < a_levels.length; i += 1) {
    		a_data = assign(a_data, a_levels[i]);
    	}

    	const block = {
    		c: function create() {
    			a = element("a");
    			if (default_slot) default_slot.c();
    			set_attributes(a, a_data);
    			add_location(a, file, 40, 0, 1249);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, a, anchor);

    			if (default_slot) {
    				default_slot.m(a, null);
    			}

    			current = true;

    			if (!mounted) {
    				dispose = listen_dev(a, "click", /*onClick*/ ctx[5], false, false, false);
    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (default_slot) {
    				if (default_slot.p && dirty & /*$$scope*/ 32768) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[15], dirty, null, null);
    				}
    			}

    			set_attributes(a, a_data = get_spread_update(a_levels, [
    				(!current || dirty & /*href*/ 1) && { href: /*href*/ ctx[0] },
    				(!current || dirty & /*ariaCurrent*/ 4) && { "aria-current": /*ariaCurrent*/ ctx[2] },
    				dirty & /*props*/ 2 && /*props*/ ctx[1],
    				dirty & /*$$restProps*/ 64 && /*$$restProps*/ ctx[6]
    			]));
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(a);
    			if (default_slot) default_slot.d(detaching);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$2.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$2($$self, $$props, $$invalidate) {
    	let ariaCurrent;
    	const omit_props_names = ["to","replace","state","getProps"];
    	let $$restProps = compute_rest_props($$props, omit_props_names);
    	let $base;
    	let $location;
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Link", slots, ['default']);
    	let { to = "#" } = $$props;
    	let { replace = false } = $$props;
    	let { state = {} } = $$props;
    	let { getProps = () => ({}) } = $$props;
    	const { base } = getContext(ROUTER);
    	validate_store(base, "base");
    	component_subscribe($$self, base, value => $$invalidate(13, $base = value));
    	const location = getContext(LOCATION);
    	validate_store(location, "location");
    	component_subscribe($$self, location, value => $$invalidate(14, $location = value));
    	const dispatch = createEventDispatcher();
    	let href, isPartiallyCurrent, isCurrent, props;

    	function onClick(event) {
    		dispatch("click", event);

    		if (shouldNavigate(event)) {
    			event.preventDefault();

    			// Don't push another entry to the history stack when the user
    			// clicks on a Link to the page they are currently on.
    			const shouldReplace = $location.pathname === href || replace;

    			navigate(href, { state, replace: shouldReplace });
    		}
    	}

    	$$self.$$set = $$new_props => {
    		$$props = assign(assign({}, $$props), exclude_internal_props($$new_props));
    		$$invalidate(6, $$restProps = compute_rest_props($$props, omit_props_names));
    		if ("to" in $$new_props) $$invalidate(7, to = $$new_props.to);
    		if ("replace" in $$new_props) $$invalidate(8, replace = $$new_props.replace);
    		if ("state" in $$new_props) $$invalidate(9, state = $$new_props.state);
    		if ("getProps" in $$new_props) $$invalidate(10, getProps = $$new_props.getProps);
    		if ("$$scope" in $$new_props) $$invalidate(15, $$scope = $$new_props.$$scope);
    	};

    	$$self.$capture_state = () => ({
    		getContext,
    		createEventDispatcher,
    		ROUTER,
    		LOCATION,
    		navigate,
    		startsWith,
    		resolve,
    		shouldNavigate,
    		to,
    		replace,
    		state,
    		getProps,
    		base,
    		location,
    		dispatch,
    		href,
    		isPartiallyCurrent,
    		isCurrent,
    		props,
    		onClick,
    		$base,
    		$location,
    		ariaCurrent
    	});

    	$$self.$inject_state = $$new_props => {
    		if ("to" in $$props) $$invalidate(7, to = $$new_props.to);
    		if ("replace" in $$props) $$invalidate(8, replace = $$new_props.replace);
    		if ("state" in $$props) $$invalidate(9, state = $$new_props.state);
    		if ("getProps" in $$props) $$invalidate(10, getProps = $$new_props.getProps);
    		if ("href" in $$props) $$invalidate(0, href = $$new_props.href);
    		if ("isPartiallyCurrent" in $$props) $$invalidate(11, isPartiallyCurrent = $$new_props.isPartiallyCurrent);
    		if ("isCurrent" in $$props) $$invalidate(12, isCurrent = $$new_props.isCurrent);
    		if ("props" in $$props) $$invalidate(1, props = $$new_props.props);
    		if ("ariaCurrent" in $$props) $$invalidate(2, ariaCurrent = $$new_props.ariaCurrent);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*to, $base*/ 8320) {
    			 $$invalidate(0, href = to === "/" ? $base.uri : resolve(to, $base.uri));
    		}

    		if ($$self.$$.dirty & /*$location, href*/ 16385) {
    			 $$invalidate(11, isPartiallyCurrent = startsWith($location.pathname, href));
    		}

    		if ($$self.$$.dirty & /*href, $location*/ 16385) {
    			 $$invalidate(12, isCurrent = href === $location.pathname);
    		}

    		if ($$self.$$.dirty & /*isCurrent*/ 4096) {
    			 $$invalidate(2, ariaCurrent = isCurrent ? "page" : undefined);
    		}

    		if ($$self.$$.dirty & /*getProps, $location, href, isPartiallyCurrent, isCurrent*/ 23553) {
    			 $$invalidate(1, props = getProps({
    				location: $location,
    				href,
    				isPartiallyCurrent,
    				isCurrent
    			}));
    		}
    	};

    	return [
    		href,
    		props,
    		ariaCurrent,
    		base,
    		location,
    		onClick,
    		$$restProps,
    		to,
    		replace,
    		state,
    		getProps,
    		isPartiallyCurrent,
    		isCurrent,
    		$base,
    		$location,
    		$$scope,
    		slots
    	];
    }

    class Link extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$2, create_fragment$2, safe_not_equal, {
    			to: 7,
    			replace: 8,
    			state: 9,
    			getProps: 10
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Link",
    			options,
    			id: create_fragment$2.name
    		});
    	}

    	get to() {
    		throw new Error("<Link>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set to(value) {
    		throw new Error("<Link>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get replace() {
    		throw new Error("<Link>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set replace(value) {
    		throw new Error("<Link>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get state() {
    		throw new Error("<Link>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set state(value) {
    		throw new Error("<Link>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get getProps() {
    		throw new Error("<Link>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set getProps(value) {
    		throw new Error("<Link>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    var niceErrors = {
      0: "Invalid value for configuration 'enforceActions', expected 'never', 'always' or 'observed'",
      1: function _(annotationType, key) {
        return "Cannot apply '" + annotationType + "' to '" + key.toString() + "': Field not found.";
      },
      5: "'keys()' can only be used on observable objects, arrays, sets and maps",
      6: "'values()' can only be used on observable objects, arrays, sets and maps",
      7: "'entries()' can only be used on observable objects, arrays and maps",
      8: "'set()' can only be used on observable objects, arrays and maps",
      9: "'remove()' can only be used on observable objects, arrays and maps",
      10: "'has()' can only be used on observable objects, arrays and maps",
      11: "'get()' can only be used on observable objects, arrays and maps",
      12: "Invalid annotation",
      13: "Dynamic observable objects cannot be frozen",
      14: "Intercept handlers should return nothing or a change object",
      15: "Observable arrays cannot be frozen",
      16: "Modification exception: the internal structure of an observable array was changed.",
      17: function _(index, length) {
        return "[mobx.array] Index out of bounds, " + index + " is larger than " + length;
      },
      18: "mobx.map requires Map polyfill for the current browser. Check babel-polyfill or core-js/es6/map.js",
      19: function _(other) {
        return "Cannot initialize from classes that inherit from Map: " + other.constructor.name;
      },
      20: function _(other) {
        return "Cannot initialize map from " + other;
      },
      21: function _(dataStructure) {
        return "Cannot convert to map from '" + dataStructure + "'";
      },
      22: "mobx.set requires Set polyfill for the current browser. Check babel-polyfill or core-js/es6/set.js",
      23: "It is not possible to get index atoms from arrays",
      24: function _(thing) {
        return "Cannot obtain administration from " + thing;
      },
      25: function _(property, name) {
        return "the entry '" + property + "' does not exist in the observable map '" + name + "'";
      },
      26: "please specify a property",
      27: function _(property, name) {
        return "no observable property '" + property.toString() + "' found on the observable object '" + name + "'";
      },
      28: function _(thing) {
        return "Cannot obtain atom from " + thing;
      },
      29: "Expecting some object",
      30: "invalid action stack. did you forget to finish an action?",
      31: "missing option for computed: get",
      32: function _(name, derivation) {
        return "Cycle detected in computation " + name + ": " + derivation;
      },
      33: function _(name) {
        return "The setter of computed value '" + name + "' is trying to update itself. Did you intend to update an _observable_ value, instead of the computed property?";
      },
      34: function _(name) {
        return "[ComputedValue '" + name + "'] It is not possible to assign a new value to a computed value.";
      },
      35: "There are multiple, different versions of MobX active. Make sure MobX is loaded only once or use `configure({ isolateGlobalState: true })`",
      36: "isolateGlobalState should be called before MobX is running any reactions",
      37: function _(method) {
        return "[mobx] `observableArray." + method + "()` mutates the array in-place, which is not allowed inside a derivation. Use `array.slice()." + method + "()` instead";
      }
    };
    var errors =  niceErrors ;
    function die(error) {
      for (var _len = arguments.length, args = new Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
        args[_key - 1] = arguments[_key];
      }

      {
        var e = typeof error === "string" ? error : errors[error];
        if (typeof e === "function") e = e.apply(null, args);
        throw new Error("[MobX] " + e);
      }
    }

    var mockGlobal = {};
    function getGlobal() {
      if (typeof window !== "undefined") {
        return window;
      }

      if (typeof global !== "undefined") {
        return global;
      }

      if (typeof self !== "undefined") {
        return self;
      }

      return mockGlobal;
    }

    var assign$1 = Object.assign;
    var getDescriptor = Object.getOwnPropertyDescriptor;
    var defineProperty = Object.defineProperty;
    var objectPrototype = Object.prototype;
    var EMPTY_ARRAY = [];
    Object.freeze(EMPTY_ARRAY);
    var EMPTY_OBJECT = {};
    Object.freeze(EMPTY_OBJECT);
    var hasProxy = typeof Proxy !== "undefined";
    var plainObjectString = /*#__PURE__*/Object.toString();
    function assertProxies() {
      if (!hasProxy) {
        die( "`Proxy` objects are not available in the current environment. Please configure MobX to enable a fallback implementation.`" );
      }
    }
    function warnAboutProxyRequirement(msg) {
      if ( globalState.verifyProxies) {
        die("MobX is currently configured to be able to run in ES5 mode, but in ES5 MobX won't be able to " + msg);
      }
    }
    function getNextId() {
      return ++globalState.mobxGuid;
    }
    /**
     * Makes sure that the provided function is invoked at most once.
     */

    function once(func) {
      var invoked = false;
      return function () {
        if (invoked) return;
        invoked = true;
        return func.apply(this, arguments);
      };
    }
    var noop$1 = function noop() {};
    function isFunction(fn) {
      return typeof fn === "function";
    }
    function isStringish(value) {
      var t = typeof value;

      switch (t) {
        case "string":
        case "symbol":
        case "number":
          return true;
      }

      return false;
    }
    function isObject(value) {
      return value !== null && typeof value === "object";
    }
    function isPlainObject(value) {
      var _proto$constructor;

      if (!isObject(value)) return false;
      var proto = Object.getPrototypeOf(value);
      if (proto == null) return true;
      return ((_proto$constructor = proto.constructor) == null ? void 0 : _proto$constructor.toString()) === plainObjectString;
    } // https://stackoverflow.com/a/37865170

    function isGenerator(obj) {
      var constructor = obj == null ? void 0 : obj.constructor;
      if (!constructor) return false;
      if ("GeneratorFunction" === constructor.name || "GeneratorFunction" === constructor.displayName) return true;
      return false;
    }
    function addHiddenProp(object, propName, value) {
      defineProperty(object, propName, {
        enumerable: false,
        writable: true,
        configurable: true,
        value: value
      });
    }
    function addHiddenFinalProp(object, propName, value) {
      defineProperty(object, propName, {
        enumerable: false,
        writable: false,
        configurable: true,
        value: value
      });
    }
    function createInstanceofPredicate(name, theClass) {
      var propName = "isMobX" + name;
      theClass.prototype[propName] = true;
      return function (x) {
        return isObject(x) && x[propName] === true;
      };
    }
    function isES6Map(thing) {
      return thing instanceof Map;
    }
    function isES6Set(thing) {
      return thing instanceof Set;
    }
    var hasGetOwnPropertySymbols = typeof Object.getOwnPropertySymbols !== "undefined";
    /**
     * Returns the following: own enumerable keys and symbols.
     */

    function getPlainObjectKeys(object) {
      var keys = Object.keys(object); // Not supported in IE, so there are not going to be symbol props anyway...

      if (!hasGetOwnPropertySymbols) return keys;
      var symbols = Object.getOwnPropertySymbols(object);
      if (!symbols.length) return keys;
      return [].concat(keys, symbols.filter(function (s) {
        return objectPrototype.propertyIsEnumerable.call(object, s);
      }));
    } // From Immer utils
    // Returns all own keys, including non-enumerable and symbolic

    var ownKeys = typeof Reflect !== "undefined" && Reflect.ownKeys ? Reflect.ownKeys : hasGetOwnPropertySymbols ? function (obj) {
      return Object.getOwnPropertyNames(obj).concat(Object.getOwnPropertySymbols(obj));
    } :
    /* istanbul ignore next */
    Object.getOwnPropertyNames;
    function stringifyKey(key) {
      if (typeof key === "string") return key;
      if (typeof key === "symbol") return key.toString();
      return new String(key).toString();
    }
    function toPrimitive(value) {
      return value === null ? null : typeof value === "object" ? "" + value : value;
    }
    function hasProp(target, prop) {
      return objectPrototype.hasOwnProperty.call(target, prop);
    } // From Immer utils

    var getOwnPropertyDescriptors = Object.getOwnPropertyDescriptors || function getOwnPropertyDescriptors(target) {
      // Polyfill needed for Hermes and IE, see https://github.com/facebook/hermes/issues/274
      var res = {}; // Note: without polyfill for ownKeys, symbols won't be picked up

      ownKeys(target).forEach(function (key) {
        res[key] = getDescriptor(target, key);
      });
      return res;
    };

    function _defineProperties(target, props) {
      for (var i = 0; i < props.length; i++) {
        var descriptor = props[i];
        descriptor.enumerable = descriptor.enumerable || false;
        descriptor.configurable = true;
        if ("value" in descriptor) descriptor.writable = true;
        Object.defineProperty(target, descriptor.key, descriptor);
      }
    }

    function _createClass(Constructor, protoProps, staticProps) {
      if (protoProps) _defineProperties(Constructor.prototype, protoProps);
      if (staticProps) _defineProperties(Constructor, staticProps);
      return Constructor;
    }

    function _extends() {
      _extends = Object.assign || function (target) {
        for (var i = 1; i < arguments.length; i++) {
          var source = arguments[i];

          for (var key in source) {
            if (Object.prototype.hasOwnProperty.call(source, key)) {
              target[key] = source[key];
            }
          }
        }

        return target;
      };

      return _extends.apply(this, arguments);
    }

    function _inheritsLoose(subClass, superClass) {
      subClass.prototype = Object.create(superClass.prototype);
      subClass.prototype.constructor = subClass;
      subClass.__proto__ = superClass;
    }

    function _assertThisInitialized(self) {
      if (self === void 0) {
        throw new ReferenceError("this hasn't been initialised - super() hasn't been called");
      }

      return self;
    }

    function _unsupportedIterableToArray(o, minLen) {
      if (!o) return;
      if (typeof o === "string") return _arrayLikeToArray(o, minLen);
      var n = Object.prototype.toString.call(o).slice(8, -1);
      if (n === "Object" && o.constructor) n = o.constructor.name;
      if (n === "Map" || n === "Set") return Array.from(o);
      if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return _arrayLikeToArray(o, minLen);
    }

    function _arrayLikeToArray(arr, len) {
      if (len == null || len > arr.length) len = arr.length;

      for (var i = 0, arr2 = new Array(len); i < len; i++) arr2[i] = arr[i];

      return arr2;
    }

    function _createForOfIteratorHelperLoose(o, allowArrayLike) {
      var it;

      if (typeof Symbol === "undefined" || o[Symbol.iterator] == null) {
        if (Array.isArray(o) || (it = _unsupportedIterableToArray(o)) || allowArrayLike && o && typeof o.length === "number") {
          if (it) o = it;
          var i = 0;
          return function () {
            if (i >= o.length) return {
              done: true
            };
            return {
              done: false,
              value: o[i++]
            };
          };
        }

        throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
      }

      it = o[Symbol.iterator]();
      return it.next.bind(it);
    }

    var storedAnnotationsSymbol = /*#__PURE__*/Symbol("mobx-stored-annotations");
    /**
     * Creates a function that acts as
     * - decorator
     * - annotation object
     */

    function createDecoratorAnnotation(annotation) {
      function decorator(target, property) {
        storeAnnotation(target, property, annotation);
      }

      return Object.assign(decorator, annotation);
    }
    /**
     * Stores annotation to prototype,
     * so it can be inspected later by `makeObservable` called from constructor
     */

    function storeAnnotation(prototype, key, annotation) {
      if (!hasProp(prototype, storedAnnotationsSymbol)) {
        addHiddenProp(prototype, storedAnnotationsSymbol, _extends({}, prototype[storedAnnotationsSymbol]));
      } // @override must override something


      if ( isOverride(annotation) && !hasProp(prototype[storedAnnotationsSymbol], key)) {
        var fieldName = prototype.constructor.name + ".prototype." + key.toString();
        die("'" + fieldName + "' is decorated with 'override', " + "but no such decorated member was found on prototype.");
      } // Cannot re-decorate


      assertNotDecorated(prototype, annotation, key); // Ignore override

      if (!isOverride(annotation)) {
        prototype[storedAnnotationsSymbol][key] = _extends({}, annotation, {
          isDecorator_: true
        });
      }
    }

    function assertNotDecorated(prototype, annotation, key) {
      if ( !isOverride(annotation) && hasProp(prototype[storedAnnotationsSymbol], key)) {
        var fieldName = prototype.constructor.name + ".prototype." + key.toString();
        var currentAnnotationType = prototype[storedAnnotationsSymbol][key].annotationType_;
        var requestedAnnotationType = annotation.annotationType_;
        die("Cannot apply '@" + requestedAnnotationType + "' to '" + fieldName + "':" + ("\nThe field is already decorated with '@" + currentAnnotationType + "'.") + "\nRe-decorating fields is not allowed." + "\nUse '@override' decorator for methods overriden by subclass.");
      }
    }
    /**
     * Collects annotations from prototypes and stores them on target (instance)
     */


    function collectStoredAnnotations(target) {
      if (!hasProp(target, storedAnnotationsSymbol)) {
        if ( !target[storedAnnotationsSymbol]) {
          die("No annotations were passed to makeObservable, but no decorated members have been found either");
        } // We need a copy as we will remove annotation from the list once it's applied.


        addHiddenProp(target, storedAnnotationsSymbol, _extends({}, target[storedAnnotationsSymbol]));
      }

      return target[storedAnnotationsSymbol];
    }

    var $mobx = /*#__PURE__*/Symbol("mobx administration");
    var Atom = /*#__PURE__*/function () {
      // for effective unobserving. BaseAtom has true, for extra optimization, so its onBecomeUnobserved never gets called, because it's not needed

      /**
       * Create a new atom. For debugging purposes it is recommended to give it a name.
       * The onBecomeObserved and onBecomeUnobserved callbacks can be used for resource management.
       */
      function Atom(name_) {
        if (name_ === void 0) {
          name_ = "Atom@" + getNextId();
        }

        this.name_ = void 0;
        this.isPendingUnobservation_ = false;
        this.isBeingObserved_ = false;
        this.observers_ = new Set();
        this.diffValue_ = 0;
        this.lastAccessedBy_ = 0;
        this.lowestObserverState_ = IDerivationState_.NOT_TRACKING_;
        this.onBOL = void 0;
        this.onBUOL = void 0;
        this.name_ = name_;
      } // onBecomeObservedListeners


      var _proto = Atom.prototype;

      _proto.onBO = function onBO() {
        if (this.onBOL) {
          this.onBOL.forEach(function (listener) {
            return listener();
          });
        }
      };

      _proto.onBUO = function onBUO() {
        if (this.onBUOL) {
          this.onBUOL.forEach(function (listener) {
            return listener();
          });
        }
      }
      /**
       * Invoke this method to notify mobx that your atom has been used somehow.
       * Returns true if there is currently a reactive context.
       */
      ;

      _proto.reportObserved = function reportObserved$1() {
        return reportObserved(this);
      }
      /**
       * Invoke this method _after_ this method has changed to signal mobx that all its observers should invalidate.
       */
      ;

      _proto.reportChanged = function reportChanged() {
        startBatch();
        propagateChanged(this);
        endBatch();
      };

      _proto.toString = function toString() {
        return this.name_;
      };

      return Atom;
    }();
    var isAtom = /*#__PURE__*/createInstanceofPredicate("Atom", Atom);
    function createAtom(name, onBecomeObservedHandler, onBecomeUnobservedHandler) {
      if (onBecomeObservedHandler === void 0) {
        onBecomeObservedHandler = noop$1;
      }

      if (onBecomeUnobservedHandler === void 0) {
        onBecomeUnobservedHandler = noop$1;
      }

      var atom = new Atom(name); // default `noop` listener will not initialize the hook Set

      if (onBecomeObservedHandler !== noop$1) {
        onBecomeObserved(atom, onBecomeObservedHandler);
      }

      if (onBecomeUnobservedHandler !== noop$1) {
        onBecomeUnobserved(atom, onBecomeUnobservedHandler);
      }

      return atom;
    }

    function identityComparer(a, b) {
      return a === b;
    }

    function structuralComparer(a, b) {
      return deepEqual(a, b);
    }

    function shallowComparer(a, b) {
      return deepEqual(a, b, 1);
    }

    function defaultComparer(a, b) {
      return Object.is(a, b);
    }

    var comparer = {
      identity: identityComparer,
      structural: structuralComparer,
      "default": defaultComparer,
      shallow: shallowComparer
    };

    function deepEnhancer(v, _, name) {
      // it is an observable already, done
      if (isObservable(v)) return v; // something that can be converted and mutated?

      if (Array.isArray(v)) return observable.array(v, {
        name: name
      });
      if (isPlainObject(v)) return observable.object(v, undefined, {
        name: name
      });
      if (isES6Map(v)) return observable.map(v, {
        name: name
      });
      if (isES6Set(v)) return observable.set(v, {
        name: name
      });
      return v;
    }
    function shallowEnhancer(v, _, name) {
      if (v === undefined || v === null) return v;
      if (isObservableObject(v) || isObservableArray(v) || isObservableMap(v) || isObservableSet(v)) return v;
      if (Array.isArray(v)) return observable.array(v, {
        name: name,
        deep: false
      });
      if (isPlainObject(v)) return observable.object(v, undefined, {
        name: name,
        deep: false
      });
      if (isES6Map(v)) return observable.map(v, {
        name: name,
        deep: false
      });
      if (isES6Set(v)) return observable.set(v, {
        name: name,
        deep: false
      });
      die("The shallow modifier / decorator can only used in combination with arrays, objects, maps and sets");
    }
    function referenceEnhancer(newValue) {
      // never turn into an observable
      return newValue;
    }
    function refStructEnhancer(v, oldValue) {
      if ( isObservable(v)) die("observable.struct should not be used with observable values");
      if (deepEqual(v, oldValue)) return oldValue;
      return v;
    }

    var OVERRIDE = "override";
    function isOverride(annotation) {
      return annotation.annotationType_ === OVERRIDE;
    }

    function createActionAnnotation(name, options) {
      return {
        annotationType_: name,
        options_: options,
        make_: make_$1,
        extend_: extend_$1
      };
    }

    function make_$1(adm, key) {
      var _this$options_$bound, _this$options_;

      var annotated = false;
      var source = adm.target_;
      var bound = (_this$options_$bound = (_this$options_ = this.options_) == null ? void 0 : _this$options_.bound) != null ? _this$options_$bound : false;

      while (source && source !== objectPrototype) {
        var descriptor = getDescriptor(source, key);

        if (descriptor) {
          // Instance or bound
          // Keep first because the operation can be intercepted
          // and we don't want to end up with partially annotated proto chain
          if (source === adm.target_ || bound) {
            var actionDescriptor = createActionDescriptor(adm, this, key, descriptor);
            var definePropertyOutcome = adm.defineProperty_(key, actionDescriptor);

            if (!definePropertyOutcome) {
              // Intercepted
              return;
            }

            annotated = true; // Don't annotate protos if bound

            if (bound) {
              break;
            }
          } // Prototype


          if (source !== adm.target_) {
            if (isAction(descriptor.value)) {
              // A prototype could have been annotated already by other constructor,
              // rest of the proto chain must be annotated already
              annotated = true;
              break;
            }

            var _actionDescriptor = createActionDescriptor(adm, this, key, descriptor, false);

            defineProperty(source, key, _actionDescriptor);
            annotated = true;
          }
        }

        source = Object.getPrototypeOf(source);
      }

      if (annotated) {
        recordAnnotationApplied(adm, this, key);
      } else if (!this.isDecorator_) {
        // Throw on missing key, except for decorators:
        // Decorator annotations are collected from whole prototype chain.
        // When called from super() some props may not exist yet.
        // However we don't have to worry about missing prop,
        // because the decorator must have been applied to something.
        die(1, this.annotationType_, adm.name_ + "." + key.toString());
      }
    }

    function extend_$1(adm, key, descriptor, proxyTrap) {
      var actionDescriptor = createActionDescriptor(adm, this, key, descriptor);
      return adm.defineProperty_(key, actionDescriptor, proxyTrap);
    }

    function assertActionDescriptor(adm, _ref, key, _ref2) {
      var annotationType_ = _ref.annotationType_;
      var value = _ref2.value;

      if ( !isFunction(value)) {
        die("Cannot apply '" + annotationType_ + "' to '" + adm.name_ + "." + key.toString() + "':" + ("\n'" + annotationType_ + "' can only be used on properties with a function value."));
      }
    }

    function createActionDescriptor(adm, annotation, key, descriptor, // provides ability to disable safeDescriptors for prototypes
    safeDescriptors) {
      var _annotation$options_, _annotation$options_$, _annotation$options_2, _annotation$options_$2, _annotation$options_3;

      if (safeDescriptors === void 0) {
        safeDescriptors = globalState.safeDescriptors;
      }

      assertActionDescriptor(adm, annotation, key, descriptor);
      var value = descriptor.value;

      if ((_annotation$options_ = annotation.options_) == null ? void 0 : _annotation$options_.bound) {
        var _adm$proxy_;

        value = value.bind((_adm$proxy_ = adm.proxy_) != null ? _adm$proxy_ : adm.target_);
      }

      return {
        value: createAction((_annotation$options_$ = (_annotation$options_2 = annotation.options_) == null ? void 0 : _annotation$options_2.name) != null ? _annotation$options_$ : key.toString(), value, (_annotation$options_$2 = (_annotation$options_3 = annotation.options_) == null ? void 0 : _annotation$options_3.autoAction) != null ? _annotation$options_$2 : false),
        // Non-configurable for classes
        // prevents accidental field redefinition in subclass
        configurable: safeDescriptors ? adm.isPlainObject_ : true,
        // https://github.com/mobxjs/mobx/pull/2641#issuecomment-737292058
        enumerable: false,
        // Non-obsevable, therefore non-writable
        // Also prevents rewriting in subclass constructor
        writable: safeDescriptors ? false : true
      };
    }

    function createFlowAnnotation(name, options) {
      return {
        annotationType_: name,
        options_: options,
        make_: make_$2,
        extend_: extend_$2
      };
    }

    function make_$2(adm, key) {
      var annotated = false;
      var source = adm.target_;

      while (source && source !== objectPrototype) {
        var descriptor = getDescriptor(source, key);

        if (descriptor) {
          if (source !== adm.target_) {
            // Prototype
            if (isFlow(descriptor.value)) {
              // A prototype could have been annotated already by other constructor,
              // rest of the proto chain must be annotated already
              annotated = true;
              break;
            }

            var flowDescriptor = createFlowDescriptor(adm, this, key, descriptor, false);
            defineProperty(source, key, flowDescriptor);
          } else {
            var _flowDescriptor = createFlowDescriptor(adm, this, key, descriptor);

            var definePropertyOutcome = adm.defineProperty_(key, _flowDescriptor);

            if (!definePropertyOutcome) {
              // Intercepted
              return;
            }
          }

          annotated = true;
        }

        source = Object.getPrototypeOf(source);
      }

      if (annotated) {
        recordAnnotationApplied(adm, this, key);
      } else if (!this.isDecorator_) {
        // Throw on missing key, except for decorators:
        // Decorator annotations are collected from whole prototype chain.
        // When called from super() some props may not exist yet.
        // However we don't have to worry about missing prop,
        // because the decorator must have been applied to something.
        die(1, this.annotationType_, adm.name_ + "." + key.toString());
      }
    }

    function extend_$2(adm, key, descriptor, proxyTrap) {
      var flowDescriptor = createFlowDescriptor(adm, this, key, descriptor);
      return adm.defineProperty_(key, flowDescriptor, proxyTrap);
    }

    function assertFlowDescriptor(adm, _ref, key, _ref2) {
      var annotationType_ = _ref.annotationType_;
      var value = _ref2.value;

      if ( !isFunction(value)) {
        die("Cannot apply '" + annotationType_ + "' to '" + adm.name_ + "." + key.toString() + "':" + ("\n'" + annotationType_ + "' can only be used on properties with a generator function value."));
      }
    }

    function createFlowDescriptor(adm, annotation, key, descriptor, // provides ability to disable safeDescriptors for prototypes
    safeDescriptors) {
      if (safeDescriptors === void 0) {
        safeDescriptors = globalState.safeDescriptors;
      }

      assertFlowDescriptor(adm, annotation, key, descriptor);
      return {
        value: flow(descriptor.value),
        // Non-configurable for classes
        // prevents accidental field redefinition in subclass
        configurable: safeDescriptors ? adm.isPlainObject_ : true,
        // https://github.com/mobxjs/mobx/pull/2641#issuecomment-737292058
        enumerable: false,
        // Non-obsevable, therefore non-writable
        // Also prevents rewriting in subclass constructor
        writable: safeDescriptors ? false : true
      };
    }

    function createComputedAnnotation(name, options) {
      return {
        annotationType_: name,
        options_: options,
        make_: make_$3,
        extend_: extend_$3
      };
    }

    function make_$3(adm, key) {
      var source = adm.target_;

      while (source && source !== objectPrototype) {
        var descriptor = getDescriptor(source, key);

        if (descriptor) {
          assertComputedDescriptor(adm, this, key, descriptor);
          var definePropertyOutcome = adm.defineComputedProperty_(key, _extends({}, this.options_, {
            get: descriptor.get,
            set: descriptor.set
          }));

          if (!definePropertyOutcome) {
            // Intercepted
            return;
          }

          recordAnnotationApplied(adm, this, key);
          return;
        }

        source = Object.getPrototypeOf(source);
      }

      if (!this.isDecorator_) {
        // Throw on missing key, except for decorators:
        // Decorator annotations are collected from whole prototype chain.
        // When called from super() some props may not exist yet.
        // However we don't have to worry about missing prop,
        // because the decorator must have been applied to something.
        die(1, this.annotationType_, adm.name_ + "." + key.toString());
      }
    }

    function extend_$3(adm, key, descriptor, proxyTrap) {
      assertComputedDescriptor(adm, this, key, descriptor);
      return adm.defineComputedProperty_(key, _extends({}, this.options_, {
        get: descriptor.get,
        set: descriptor.set
      }), proxyTrap);
    }

    function assertComputedDescriptor(adm, _ref, key, _ref2) {
      var annotationType_ = _ref.annotationType_;
      var get = _ref2.get;

      if ( !get) {
        die("Cannot apply '" + annotationType_ + "' to '" + adm.name_ + "." + key.toString() + "':" + ("\n'" + annotationType_ + "' can only be used on getter(+setter) properties."));
      }
    }

    function createObservableAnnotation(name, options) {
      return {
        annotationType_: name,
        options_: options,
        make_: make_$4,
        extend_: extend_$4
      };
    }

    function make_$4(adm, key) {
      var source = adm.target_; // Copy props from proto as well, see test:
      // "decorate should work with Object.create"

      while (source && source !== objectPrototype) {
        var descriptor = getDescriptor(source, key);

        if (descriptor) {
          var _this$options_$enhanc, _this$options_;

          assertObservableDescriptor(adm, this, key, descriptor);
          var definePropertyOutcome = adm.defineObservableProperty_(key, descriptor.value, (_this$options_$enhanc = (_this$options_ = this.options_) == null ? void 0 : _this$options_.enhancer) != null ? _this$options_$enhanc : deepEnhancer);

          if (!definePropertyOutcome) {
            // Intercepted
            return;
          }

          recordAnnotationApplied(adm, this, key);
          return;
        }

        source = Object.getPrototypeOf(source);
      }

      if (!this.isDecorator_) {
        // Throw on missing key, except for decorators:
        // Decorator annotations are collected from whole prototype chain.
        // When called from super() some props may not exist yet.
        // However we don't have to worry about missing prop,
        // because the decorator must have been applied to something.
        die(1, this.annotationType_, adm.name_ + "." + key.toString());
      }
    }

    function extend_$4(adm, key, descriptor, proxyTrap) {
      var _this$options_$enhanc2, _this$options_2;

      assertObservableDescriptor(adm, this, key, descriptor);
      return adm.defineObservableProperty_(key, descriptor.value, (_this$options_$enhanc2 = (_this$options_2 = this.options_) == null ? void 0 : _this$options_2.enhancer) != null ? _this$options_$enhanc2 : deepEnhancer, proxyTrap);
    }

    function assertObservableDescriptor(adm, _ref, key, descriptor) {
      var annotationType_ = _ref.annotationType_;

      if ( !("value" in descriptor)) {
        die("Cannot apply '" + annotationType_ + "' to '" + adm.name_ + "." + key.toString() + "':" + ("\n'" + annotationType_ + "' cannot be used on getter/setter properties"));
      }
    }

    // in the majority of cases

    var defaultCreateObservableOptions = {
      deep: true,
      name: undefined,
      defaultDecorator: undefined,
      proxy: true
    };
    Object.freeze(defaultCreateObservableOptions);
    function asCreateObservableOptions(thing) {
      return thing || defaultCreateObservableOptions;
    }
    var observableAnnotation = /*#__PURE__*/createObservableAnnotation("observable");
    var observableRefAnnotation = /*#__PURE__*/createObservableAnnotation("observable.ref", {
      enhancer: referenceEnhancer
    });
    var observableShallowAnnotation = /*#__PURE__*/createObservableAnnotation("observable.shallow", {
      enhancer: shallowEnhancer
    });
    var observableStructAnnotation = /*#__PURE__*/createObservableAnnotation("observable.struct", {
      enhancer: refStructEnhancer
    });
    var observableDecoratorAnnotation = /*#__PURE__*/createDecoratorAnnotation(observableAnnotation);
    function getEnhancerFromOptions(options) {
      return options.deep === true ? deepEnhancer : options.deep === false ? referenceEnhancer : getEnhancerFromAnnotation(options.defaultDecorator);
    }
    function getAnnotationFromOptions(options) {
      return options ? options.deep === true ? observableAnnotation : options.deep === false ? observableRefAnnotation : options.defaultDecorator : undefined;
    }
    function getEnhancerFromAnnotation(annotation) {
      var _annotation$options_$, _annotation$options_;

      return !annotation ? deepEnhancer : (_annotation$options_$ = (_annotation$options_ = annotation.options_) == null ? void 0 : _annotation$options_.enhancer) != null ? _annotation$options_$ : deepEnhancer;
    }
    /**
     * Turns an object, array or function into a reactive structure.
     * @param v the value which should become observable.
     */

    function createObservable(v, arg2, arg3) {
      // @observable someProp;
      if (isStringish(arg2)) {
        storeAnnotation(v, arg2, observableAnnotation);
        return;
      } // already observable - ignore


      if (isObservable(v)) return v; // plain object

      if (isPlainObject(v)) return observable.object(v, arg2, arg3); // Array

      if (Array.isArray(v)) return observable.array(v, arg2); // Map

      if (isES6Map(v)) return observable.map(v, arg2); // Set

      if (isES6Set(v)) return observable.set(v, arg2); // other object - ignore

      if (typeof v === "object" && v !== null) return v; // anything else

      return observable.box(v);
    }

    Object.assign(createObservable, observableDecoratorAnnotation);
    var observableFactories = {
      box: function box(value, options) {
        var o = asCreateObservableOptions(options);
        return new ObservableValue(value, getEnhancerFromOptions(o), o.name, true, o.equals);
      },
      array: function array(initialValues, options) {
        var o = asCreateObservableOptions(options);
        return (globalState.useProxies === false || o.proxy === false ? createLegacyArray : createObservableArray)(initialValues, getEnhancerFromOptions(o), o.name);
      },
      map: function map(initialValues, options) {
        var o = asCreateObservableOptions(options);
        return new ObservableMap(initialValues, getEnhancerFromOptions(o), o.name);
      },
      set: function set(initialValues, options) {
        var o = asCreateObservableOptions(options);
        return new ObservableSet(initialValues, getEnhancerFromOptions(o), o.name);
      },
      object: function object(props, decorators, options) {
        return extendObservable(globalState.useProxies === false || (options == null ? void 0 : options.proxy) === false ? asObservableObject({}, options) : asDynamicObservableObject({}, options), props, decorators);
      },
      ref: /*#__PURE__*/createDecoratorAnnotation(observableRefAnnotation),
      shallow: /*#__PURE__*/createDecoratorAnnotation(observableShallowAnnotation),
      deep: observableDecoratorAnnotation,
      struct: /*#__PURE__*/createDecoratorAnnotation(observableStructAnnotation)
    }; // eslint-disable-next-line

    var observable = /*#__PURE__*/assign$1(createObservable, observableFactories);

    var COMPUTED = "computed";
    var COMPUTED_STRUCT = "computed.struct";
    var computedAnnotation = /*#__PURE__*/createComputedAnnotation(COMPUTED);
    var computedStructAnnotation = /*#__PURE__*/createComputedAnnotation(COMPUTED_STRUCT, {
      equals: comparer.structural
    });
    /**
     * Decorator for class properties: @computed get value() { return expr; }.
     * For legacy purposes also invokable as ES5 observable created: `computed(() => expr)`;
     */

    var computed = function computed(arg1, arg2) {
      if (isStringish(arg2)) {
        // @computed
        return storeAnnotation(arg1, arg2, computedAnnotation);
      }

      if (isPlainObject(arg1)) {
        // @computed({ options })
        return createDecoratorAnnotation(createComputedAnnotation(COMPUTED, arg1));
      } // computed(expr, options?)


      {
        if (!isFunction(arg1)) die("First argument to `computed` should be an expression.");
        if (isFunction(arg2)) die("A setter as second argument is no longer supported, use `{ set: fn }` option instead");
      }

      var opts = isPlainObject(arg2) ? arg2 : {};
      opts.get = arg1;
      opts.name = opts.name || arg1.name || "";
      /* for generated name */

      return new ComputedValue(opts);
    };
    Object.assign(computed, computedAnnotation);
    computed.struct = /*#__PURE__*/createDecoratorAnnotation(computedStructAnnotation);

    var _getDescriptor$config, _getDescriptor;
    // mobx versions

    var currentActionId = 0;
    var nextActionId = 1;
    var isFunctionNameConfigurable = (_getDescriptor$config = (_getDescriptor = /*#__PURE__*/getDescriptor(function () {}, "name")) == null ? void 0 : _getDescriptor.configurable) != null ? _getDescriptor$config : false; // we can safely recycle this object

    var tmpNameDescriptor = {
      value: "action",
      configurable: true,
      writable: false,
      enumerable: false
    };
    function createAction(actionName, fn, autoAction, ref) {
      if (autoAction === void 0) {
        autoAction = false;
      }

      {
        if (!isFunction(fn)) die("`action` can only be invoked on functions");
        if (typeof actionName !== "string" || !actionName) die("actions should have valid names, got: '" + actionName + "'");
      }

      function res() {
        return executeAction(actionName, autoAction, fn, ref || this, arguments);
      }

      res.isMobxAction = true;

      if (isFunctionNameConfigurable) {
        tmpNameDescriptor.value = actionName;
        Object.defineProperty(res, "name", tmpNameDescriptor);
      }

      return res;
    }
    function executeAction(actionName, canRunAsDerivation, fn, scope, args) {
      var runInfo = _startAction(actionName, canRunAsDerivation, scope, args);

      try {
        return fn.apply(scope, args);
      } catch (err) {
        runInfo.error_ = err;
        throw err;
      } finally {
        _endAction(runInfo);
      }
    }
    function _startAction(actionName, canRunAsDerivation, // true for autoAction
    scope, args) {
      var notifySpy_ =  isSpyEnabled() && !!actionName;
      var startTime_ = 0;

      if ( notifySpy_) {
        startTime_ = Date.now();
        var flattenedArgs = args ? Array.from(args) : EMPTY_ARRAY;
        spyReportStart({
          type: ACTION,
          name: actionName,
          object: scope,
          arguments: flattenedArgs
        });
      }

      var prevDerivation_ = globalState.trackingDerivation;
      var runAsAction = !canRunAsDerivation || !prevDerivation_;
      startBatch();
      var prevAllowStateChanges_ = globalState.allowStateChanges; // by default preserve previous allow

      if (runAsAction) {
        untrackedStart();
        prevAllowStateChanges_ = allowStateChangesStart(true);
      }

      var prevAllowStateReads_ = allowStateReadsStart(true);
      var runInfo = {
        runAsAction_: runAsAction,
        prevDerivation_: prevDerivation_,
        prevAllowStateChanges_: prevAllowStateChanges_,
        prevAllowStateReads_: prevAllowStateReads_,
        notifySpy_: notifySpy_,
        startTime_: startTime_,
        actionId_: nextActionId++,
        parentActionId_: currentActionId
      };
      currentActionId = runInfo.actionId_;
      return runInfo;
    }
    function _endAction(runInfo) {
      if (currentActionId !== runInfo.actionId_) {
        die(30);
      }

      currentActionId = runInfo.parentActionId_;

      if (runInfo.error_ !== undefined) {
        globalState.suppressReactionErrors = true;
      }

      allowStateChangesEnd(runInfo.prevAllowStateChanges_);
      allowStateReadsEnd(runInfo.prevAllowStateReads_);
      endBatch();
      if (runInfo.runAsAction_) untrackedEnd(runInfo.prevDerivation_);

      if ( runInfo.notifySpy_) {
        spyReportEnd({
          time: Date.now() - runInfo.startTime_
        });
      }

      globalState.suppressReactionErrors = false;
    }
    function allowStateChangesStart(allowStateChanges) {
      var prev = globalState.allowStateChanges;
      globalState.allowStateChanges = allowStateChanges;
      return prev;
    }
    function allowStateChangesEnd(prev) {
      globalState.allowStateChanges = prev;
    }

    var _Symbol$toPrimitive;
    var CREATE = "create";
    _Symbol$toPrimitive = Symbol.toPrimitive;
    var ObservableValue = /*#__PURE__*/function (_Atom) {
      _inheritsLoose(ObservableValue, _Atom);

      function ObservableValue(value, enhancer, name_, notifySpy, equals) {
        var _this;

        if (name_ === void 0) {
          name_ = "ObservableValue@" + getNextId();
        }

        if (notifySpy === void 0) {
          notifySpy = true;
        }

        if (equals === void 0) {
          equals = comparer["default"];
        }

        _this = _Atom.call(this, name_) || this;
        _this.enhancer = void 0;
        _this.name_ = void 0;
        _this.equals = void 0;
        _this.hasUnreportedChange_ = false;
        _this.interceptors_ = void 0;
        _this.changeListeners_ = void 0;
        _this.value_ = void 0;
        _this.dehancer = void 0;
        _this.enhancer = enhancer;
        _this.name_ = name_;
        _this.equals = equals;
        _this.value_ = enhancer(value, undefined, name_);

        if ( notifySpy && isSpyEnabled()) {
          // only notify spy if this is a stand-alone observable
          spyReport({
            type: CREATE,
            object: _assertThisInitialized(_this),
            observableKind: "value",
            debugObjectName: _this.name_,
            newValue: "" + _this.value_
          });
        }

        return _this;
      }

      var _proto = ObservableValue.prototype;

      _proto.dehanceValue = function dehanceValue(value) {
        if (this.dehancer !== undefined) return this.dehancer(value);
        return value;
      };

      _proto.set = function set(newValue) {
        var oldValue = this.value_;
        newValue = this.prepareNewValue_(newValue);

        if (newValue !== globalState.UNCHANGED) {
          var notifySpy = isSpyEnabled();

          if ( notifySpy) {
            spyReportStart({
              type: UPDATE,
              object: this,
              observableKind: "value",
              debugObjectName: this.name_,
              newValue: newValue,
              oldValue: oldValue
            });
          }

          this.setNewValue_(newValue);
          if ( notifySpy) spyReportEnd();
        }
      };

      _proto.prepareNewValue_ = function prepareNewValue_(newValue) {
        checkIfStateModificationsAreAllowed(this);

        if (hasInterceptors(this)) {
          var change = interceptChange(this, {
            object: this,
            type: UPDATE,
            newValue: newValue
          });
          if (!change) return globalState.UNCHANGED;
          newValue = change.newValue;
        } // apply modifier


        newValue = this.enhancer(newValue, this.value_, this.name_);
        return this.equals(this.value_, newValue) ? globalState.UNCHANGED : newValue;
      };

      _proto.setNewValue_ = function setNewValue_(newValue) {
        var oldValue = this.value_;
        this.value_ = newValue;
        this.reportChanged();

        if (hasListeners(this)) {
          notifyListeners(this, {
            type: UPDATE,
            object: this,
            newValue: newValue,
            oldValue: oldValue
          });
        }
      };

      _proto.get = function get() {
        this.reportObserved();
        return this.dehanceValue(this.value_);
      };

      _proto.intercept_ = function intercept_(handler) {
        return registerInterceptor(this, handler);
      };

      _proto.observe_ = function observe_(listener, fireImmediately) {
        if (fireImmediately) listener({
          observableKind: "value",
          debugObjectName: this.name_,
          object: this,
          type: UPDATE,
          newValue: this.value_,
          oldValue: undefined
        });
        return registerListener(this, listener);
      };

      _proto.raw = function raw() {
        // used by MST ot get undehanced value
        return this.value_;
      };

      _proto.toJSON = function toJSON() {
        return this.get();
      };

      _proto.toString = function toString() {
        return this.name_ + "[" + this.value_ + "]";
      };

      _proto.valueOf = function valueOf() {
        return toPrimitive(this.get());
      };

      _proto[_Symbol$toPrimitive] = function () {
        return this.valueOf();
      };

      return ObservableValue;
    }(Atom);

    var _Symbol$toPrimitive$1;
    /**
     * A node in the state dependency root that observes other nodes, and can be observed itself.
     *
     * ComputedValue will remember the result of the computation for the duration of the batch, or
     * while being observed.
     *
     * During this time it will recompute only when one of its direct dependencies changed,
     * but only when it is being accessed with `ComputedValue.get()`.
     *
     * Implementation description:
     * 1. First time it's being accessed it will compute and remember result
     *    give back remembered result until 2. happens
     * 2. First time any deep dependency change, propagate POSSIBLY_STALE to all observers, wait for 3.
     * 3. When it's being accessed, recompute if any shallow dependency changed.
     *    if result changed: propagate STALE to all observers, that were POSSIBLY_STALE from the last step.
     *    go to step 2. either way
     *
     * If at any point it's outside batch and it isn't observed: reset everything and go to 1.
     */

    _Symbol$toPrimitive$1 = Symbol.toPrimitive;
    var ComputedValue = /*#__PURE__*/function () {
      // nodes we are looking at. Our value depends on these nodes
      // during tracking it's an array with new observed observers
      // to check for cycles
      // N.B: unminified as it is used by MST

      /**
       * Create a new computed value based on a function expression.
       *
       * The `name` property is for debug purposes only.
       *
       * The `equals` property specifies the comparer function to use to determine if a newly produced
       * value differs from the previous value. Two comparers are provided in the library; `defaultComparer`
       * compares based on identity comparison (===), and `structuralComparer` deeply compares the structure.
       * Structural comparison can be convenient if you always produce a new aggregated object and
       * don't want to notify observers if it is structurally the same.
       * This is useful for working with vectors, mouse coordinates etc.
       */
      function ComputedValue(options) {
        this.dependenciesState_ = IDerivationState_.NOT_TRACKING_;
        this.observing_ = [];
        this.newObserving_ = null;
        this.isBeingObserved_ = false;
        this.isPendingUnobservation_ = false;
        this.observers_ = new Set();
        this.diffValue_ = 0;
        this.runId_ = 0;
        this.lastAccessedBy_ = 0;
        this.lowestObserverState_ = IDerivationState_.UP_TO_DATE_;
        this.unboundDepsCount_ = 0;
        this.mapid_ = "#" + getNextId();
        this.value_ = new CaughtException(null);
        this.name_ = void 0;
        this.triggeredBy_ = void 0;
        this.isComputing_ = false;
        this.isRunningSetter_ = false;
        this.derivation = void 0;
        this.setter_ = void 0;
        this.isTracing_ = TraceMode.NONE;
        this.scope_ = void 0;
        this.equals_ = void 0;
        this.requiresReaction_ = void 0;
        this.keepAlive_ = void 0;
        this.onBOL = void 0;
        this.onBUOL = void 0;
        if (!options.get) die(31);
        this.derivation = options.get;
        this.name_ = options.name || "ComputedValue@" + getNextId();
        if (options.set) this.setter_ = createAction(this.name_ + "-setter", options.set);
        this.equals_ = options.equals || (options.compareStructural || options.struct ? comparer.structural : comparer["default"]);
        this.scope_ = options.context;
        this.requiresReaction_ = !!options.requiresReaction;
        this.keepAlive_ = !!options.keepAlive;
      }

      var _proto = ComputedValue.prototype;

      _proto.onBecomeStale_ = function onBecomeStale_() {
        propagateMaybeChanged(this);
      };

      _proto.onBO = function onBO() {
        if (this.onBOL) {
          this.onBOL.forEach(function (listener) {
            return listener();
          });
        }
      };

      _proto.onBUO = function onBUO() {
        if (this.onBUOL) {
          this.onBUOL.forEach(function (listener) {
            return listener();
          });
        }
      }
      /**
       * Returns the current value of this computed value.
       * Will evaluate its computation first if needed.
       */
      ;

      _proto.get = function get() {
        if (this.isComputing_) die(32, this.name_, this.derivation);

        if (globalState.inBatch === 0 && // !globalState.trackingDerivatpion &&
        this.observers_.size === 0 && !this.keepAlive_) {
          if (shouldCompute(this)) {
            this.warnAboutUntrackedRead_();
            startBatch(); // See perf test 'computed memoization'

            this.value_ = this.computeValue_(false);
            endBatch();
          }
        } else {
          reportObserved(this);

          if (shouldCompute(this)) {
            var prevTrackingContext = globalState.trackingContext;
            if (this.keepAlive_ && !prevTrackingContext) globalState.trackingContext = this;
            if (this.trackAndCompute()) propagateChangeConfirmed(this);
            globalState.trackingContext = prevTrackingContext;
          }
        }

        var result = this.value_;
        if (isCaughtException(result)) throw result.cause;
        return result;
      };

      _proto.set = function set(value) {
        if (this.setter_) {
          if (this.isRunningSetter_) die(33, this.name_);
          this.isRunningSetter_ = true;

          try {
            this.setter_.call(this.scope_, value);
          } finally {
            this.isRunningSetter_ = false;
          }
        } else die(34, this.name_);
      };

      _proto.trackAndCompute = function trackAndCompute() {
        // N.B: unminified as it is used by MST
        var oldValue = this.value_;
        var wasSuspended =
        /* see #1208 */
        this.dependenciesState_ === IDerivationState_.NOT_TRACKING_;
        var newValue = this.computeValue_(true);

        if ( isSpyEnabled()) {
          spyReport({
            observableKind: "computed",
            debugObjectName: this.name_,
            object: this.scope_,
            type: "update",
            oldValue: this.value_,
            newValue: newValue
          });
        }

        var changed = wasSuspended || isCaughtException(oldValue) || isCaughtException(newValue) || !this.equals_(oldValue, newValue);

        if (changed) {
          this.value_ = newValue;
        }

        return changed;
      };

      _proto.computeValue_ = function computeValue_(track) {
        this.isComputing_ = true; // don't allow state changes during computation

        var prev = allowStateChangesStart(false);
        var res;

        if (track) {
          res = trackDerivedFunction(this, this.derivation, this.scope_);
        } else {
          if (globalState.disableErrorBoundaries === true) {
            res = this.derivation.call(this.scope_);
          } else {
            try {
              res = this.derivation.call(this.scope_);
            } catch (e) {
              res = new CaughtException(e);
            }
          }
        }

        allowStateChangesEnd(prev);
        this.isComputing_ = false;
        return res;
      };

      _proto.suspend_ = function suspend_() {
        if (!this.keepAlive_) {
          clearObserving(this);
          this.value_ = undefined; // don't hold on to computed value!
        }
      };

      _proto.observe_ = function observe_(listener, fireImmediately) {
        var _this = this;

        var firstTime = true;
        var prevValue = undefined;
        return autorun(function () {
          // TODO: why is this in a different place than the spyReport() function? in all other observables it's called in the same place
          var newValue = _this.get();

          if (!firstTime || fireImmediately) {
            var prevU = untrackedStart();
            listener({
              observableKind: "computed",
              debugObjectName: _this.name_,
              type: UPDATE,
              object: _this,
              newValue: newValue,
              oldValue: prevValue
            });
            untrackedEnd(prevU);
          }

          firstTime = false;
          prevValue = newValue;
        });
      };

      _proto.warnAboutUntrackedRead_ = function warnAboutUntrackedRead_() {

        if (this.requiresReaction_ === true) {
          die("[mobx] Computed value " + this.name_ + " is read outside a reactive context");
        }

        if (this.isTracing_ !== TraceMode.NONE) {
          console.log("[mobx.trace] '" + this.name_ + "' is being read outside a reactive context. Doing a full recompute");
        }

        if (globalState.computedRequiresReaction) {
          console.warn("[mobx] Computed value " + this.name_ + " is being read outside a reactive context. Doing a full recompute");
        }
      };

      _proto.toString = function toString() {
        return this.name_ + "[" + this.derivation.toString() + "]";
      };

      _proto.valueOf = function valueOf() {
        return toPrimitive(this.get());
      };

      _proto[_Symbol$toPrimitive$1] = function () {
        return this.valueOf();
      };

      return ComputedValue;
    }();
    var isComputedValue = /*#__PURE__*/createInstanceofPredicate("ComputedValue", ComputedValue);

    var IDerivationState_;

    (function (IDerivationState_) {
      // before being run or (outside batch and not being observed)
      // at this point derivation is not holding any data about dependency tree
      IDerivationState_[IDerivationState_["NOT_TRACKING_"] = -1] = "NOT_TRACKING_"; // no shallow dependency changed since last computation
      // won't recalculate derivation
      // this is what makes mobx fast

      IDerivationState_[IDerivationState_["UP_TO_DATE_"] = 0] = "UP_TO_DATE_"; // some deep dependency changed, but don't know if shallow dependency changed
      // will require to check first if UP_TO_DATE or POSSIBLY_STALE
      // currently only ComputedValue will propagate POSSIBLY_STALE
      //
      // having this state is second big optimization:
      // don't have to recompute on every dependency change, but only when it's needed

      IDerivationState_[IDerivationState_["POSSIBLY_STALE_"] = 1] = "POSSIBLY_STALE_"; // A shallow dependency has changed since last computation and the derivation
      // will need to recompute when it's needed next.

      IDerivationState_[IDerivationState_["STALE_"] = 2] = "STALE_";
    })(IDerivationState_ || (IDerivationState_ = {}));

    var TraceMode;

    (function (TraceMode) {
      TraceMode[TraceMode["NONE"] = 0] = "NONE";
      TraceMode[TraceMode["LOG"] = 1] = "LOG";
      TraceMode[TraceMode["BREAK"] = 2] = "BREAK";
    })(TraceMode || (TraceMode = {}));

    var CaughtException = function CaughtException(cause) {
      this.cause = void 0;
      this.cause = cause; // Empty
    };
    function isCaughtException(e) {
      return e instanceof CaughtException;
    }
    /**
     * Finds out whether any dependency of the derivation has actually changed.
     * If dependenciesState is 1 then it will recalculate dependencies,
     * if any dependency changed it will propagate it by changing dependenciesState to 2.
     *
     * By iterating over the dependencies in the same order that they were reported and
     * stopping on the first change, all the recalculations are only called for ComputedValues
     * that will be tracked by derivation. That is because we assume that if the first x
     * dependencies of the derivation doesn't change then the derivation should run the same way
     * up until accessing x-th dependency.
     */

    function shouldCompute(derivation) {
      switch (derivation.dependenciesState_) {
        case IDerivationState_.UP_TO_DATE_:
          return false;

        case IDerivationState_.NOT_TRACKING_:
        case IDerivationState_.STALE_:
          return true;

        case IDerivationState_.POSSIBLY_STALE_:
          {
            // state propagation can occur outside of action/reactive context #2195
            var prevAllowStateReads = allowStateReadsStart(true);
            var prevUntracked = untrackedStart(); // no need for those computeds to be reported, they will be picked up in trackDerivedFunction.

            var obs = derivation.observing_,
                l = obs.length;

            for (var i = 0; i < l; i++) {
              var obj = obs[i];

              if (isComputedValue(obj)) {
                if (globalState.disableErrorBoundaries) {
                  obj.get();
                } else {
                  try {
                    obj.get();
                  } catch (e) {
                    // we are not interested in the value *or* exception at this moment, but if there is one, notify all
                    untrackedEnd(prevUntracked);
                    allowStateReadsEnd(prevAllowStateReads);
                    return true;
                  }
                } // if ComputedValue `obj` actually changed it will be computed and propagated to its observers.
                // and `derivation` is an observer of `obj`
                // invariantShouldCompute(derivation)


                if (derivation.dependenciesState_ === IDerivationState_.STALE_) {
                  untrackedEnd(prevUntracked);
                  allowStateReadsEnd(prevAllowStateReads);
                  return true;
                }
              }
            }

            changeDependenciesStateTo0(derivation);
            untrackedEnd(prevUntracked);
            allowStateReadsEnd(prevAllowStateReads);
            return false;
          }
      }
    }
    function checkIfStateModificationsAreAllowed(atom) {

      var hasObservers = atom.observers_.size > 0; // Should not be possible to change observed state outside strict mode, except during initialization, see #563

      if (!globalState.allowStateChanges && (hasObservers || globalState.enforceActions === "always")) console.warn("[MobX] " + (globalState.enforceActions ? "Since strict-mode is enabled, changing (observed) observable values without using an action is not allowed. Tried to modify: " : "Side effects like changing state are not allowed at this point. Are you trying to modify state from, for example, a computed value or the render function of a React component? You can wrap side effects in 'runInAction' (or decorate functions with 'action') if needed. Tried to modify: ") + atom.name_);
    }
    function checkIfStateReadsAreAllowed(observable) {
      if ( !globalState.allowStateReads && globalState.observableRequiresReaction) {
        console.warn("[mobx] Observable " + observable.name_ + " being read outside a reactive context");
      }
    }
    /**
     * Executes the provided function `f` and tracks which observables are being accessed.
     * The tracking information is stored on the `derivation` object and the derivation is registered
     * as observer of any of the accessed observables.
     */

    function trackDerivedFunction(derivation, f, context) {
      var prevAllowStateReads = allowStateReadsStart(true); // pre allocate array allocation + room for variation in deps
      // array will be trimmed by bindDependencies

      changeDependenciesStateTo0(derivation);
      derivation.newObserving_ = new Array(derivation.observing_.length + 100);
      derivation.unboundDepsCount_ = 0;
      derivation.runId_ = ++globalState.runId;
      var prevTracking = globalState.trackingDerivation;
      globalState.trackingDerivation = derivation;
      globalState.inBatch++;
      var result;

      if (globalState.disableErrorBoundaries === true) {
        result = f.call(context);
      } else {
        try {
          result = f.call(context);
        } catch (e) {
          result = new CaughtException(e);
        }
      }

      globalState.inBatch--;
      globalState.trackingDerivation = prevTracking;
      bindDependencies(derivation);
      warnAboutDerivationWithoutDependencies(derivation);
      allowStateReadsEnd(prevAllowStateReads);
      return result;
    }

    function warnAboutDerivationWithoutDependencies(derivation) {
      if (derivation.observing_.length !== 0) return;

      if (globalState.reactionRequiresObservable || derivation.requiresObservable_) {
        console.warn("[mobx] Derivation " + derivation.name_ + " is created/updated without reading any observable value");
      }
    }
    /**
     * diffs newObserving with observing.
     * update observing to be newObserving with unique observables
     * notify observers that become observed/unobserved
     */


    function bindDependencies(derivation) {
      // invariant(derivation.dependenciesState !== IDerivationState.NOT_TRACKING, "INTERNAL ERROR bindDependencies expects derivation.dependenciesState !== -1");
      var prevObserving = derivation.observing_;
      var observing = derivation.observing_ = derivation.newObserving_;
      var lowestNewObservingDerivationState = IDerivationState_.UP_TO_DATE_; // Go through all new observables and check diffValue: (this list can contain duplicates):
      //   0: first occurrence, change to 1 and keep it
      //   1: extra occurrence, drop it

      var i0 = 0,
          l = derivation.unboundDepsCount_;

      for (var i = 0; i < l; i++) {
        var dep = observing[i];

        if (dep.diffValue_ === 0) {
          dep.diffValue_ = 1;
          if (i0 !== i) observing[i0] = dep;
          i0++;
        } // Upcast is 'safe' here, because if dep is IObservable, `dependenciesState` will be undefined,
        // not hitting the condition


        if (dep.dependenciesState_ > lowestNewObservingDerivationState) {
          lowestNewObservingDerivationState = dep.dependenciesState_;
        }
      }

      observing.length = i0;
      derivation.newObserving_ = null; // newObserving shouldn't be needed outside tracking (statement moved down to work around FF bug, see #614)
      // Go through all old observables and check diffValue: (it is unique after last bindDependencies)
      //   0: it's not in new observables, unobserve it
      //   1: it keeps being observed, don't want to notify it. change to 0

      l = prevObserving.length;

      while (l--) {
        var _dep = prevObserving[l];

        if (_dep.diffValue_ === 0) {
          removeObserver(_dep, derivation);
        }

        _dep.diffValue_ = 0;
      } // Go through all new observables and check diffValue: (now it should be unique)
      //   0: it was set to 0 in last loop. don't need to do anything.
      //   1: it wasn't observed, let's observe it. set back to 0


      while (i0--) {
        var _dep2 = observing[i0];

        if (_dep2.diffValue_ === 1) {
          _dep2.diffValue_ = 0;
          addObserver(_dep2, derivation);
        }
      } // Some new observed derivations may become stale during this derivation computation
      // so they have had no chance to propagate staleness (#916)


      if (lowestNewObservingDerivationState !== IDerivationState_.UP_TO_DATE_) {
        derivation.dependenciesState_ = lowestNewObservingDerivationState;
        derivation.onBecomeStale_();
      }
    }

    function clearObserving(derivation) {
      // invariant(globalState.inBatch > 0, "INTERNAL ERROR clearObserving should be called only inside batch");
      var obs = derivation.observing_;
      derivation.observing_ = [];
      var i = obs.length;

      while (i--) {
        removeObserver(obs[i], derivation);
      }

      derivation.dependenciesState_ = IDerivationState_.NOT_TRACKING_;
    }
    function untracked(action) {
      var prev = untrackedStart();

      try {
        return action();
      } finally {
        untrackedEnd(prev);
      }
    }
    function untrackedStart() {
      var prev = globalState.trackingDerivation;
      globalState.trackingDerivation = null;
      return prev;
    }
    function untrackedEnd(prev) {
      globalState.trackingDerivation = prev;
    }
    function allowStateReadsStart(allowStateReads) {
      var prev = globalState.allowStateReads;
      globalState.allowStateReads = allowStateReads;
      return prev;
    }
    function allowStateReadsEnd(prev) {
      globalState.allowStateReads = prev;
    }
    /**
     * needed to keep `lowestObserverState` correct. when changing from (2 or 1) to 0
     *
     */

    function changeDependenciesStateTo0(derivation) {
      if (derivation.dependenciesState_ === IDerivationState_.UP_TO_DATE_) return;
      derivation.dependenciesState_ = IDerivationState_.UP_TO_DATE_;
      var obs = derivation.observing_;
      var i = obs.length;

      while (i--) {
        obs[i].lowestObserverState_ = IDerivationState_.UP_TO_DATE_;
      }
    }
    var MobXGlobals = function MobXGlobals() {
      this.version = 6;
      this.UNCHANGED = {};
      this.trackingDerivation = null;
      this.trackingContext = null;
      this.runId = 0;
      this.mobxGuid = 0;
      this.inBatch = 0;
      this.pendingUnobservations = [];
      this.pendingReactions = [];
      this.isRunningReactions = false;
      this.allowStateChanges = false;
      this.allowStateReads = true;
      this.enforceActions = true;
      this.spyListeners = [];
      this.globalReactionErrorHandlers = [];
      this.computedRequiresReaction = false;
      this.reactionRequiresObservable = false;
      this.observableRequiresReaction = false;
      this.disableErrorBoundaries = false;
      this.suppressReactionErrors = false;
      this.useProxies = true;
      this.verifyProxies = false;
      this.safeDescriptors = true;
    };
    var canMergeGlobalState = true;
    var globalState = /*#__PURE__*/function () {
      var global = /*#__PURE__*/getGlobal();
      if (global.__mobxInstanceCount > 0 && !global.__mobxGlobals) canMergeGlobalState = false;
      if (global.__mobxGlobals && global.__mobxGlobals.version !== new MobXGlobals().version) canMergeGlobalState = false;

      if (!canMergeGlobalState) {
        setTimeout(function () {
          {
            die(35);
          }
        }, 1);
        return new MobXGlobals();
      } else if (global.__mobxGlobals) {
        global.__mobxInstanceCount += 1;
        if (!global.__mobxGlobals.UNCHANGED) global.__mobxGlobals.UNCHANGED = {}; // make merge backward compatible

        return global.__mobxGlobals;
      } else {
        global.__mobxInstanceCount = 1;
        return global.__mobxGlobals = /*#__PURE__*/new MobXGlobals();
      }
    }();
    //     const list = observable.observers
    //     const map = observable.observersIndexes
    //     const l = list.length
    //     for (let i = 0; i < l; i++) {
    //         const id = list[i].__mapid
    //         if (i) {
    //             invariant(map[id] === i, "INTERNAL ERROR maps derivation.__mapid to index in list") // for performance
    //         } else {
    //             invariant(!(id in map), "INTERNAL ERROR observer on index 0 shouldn't be held in map.") // for performance
    //         }
    //     }
    //     invariant(
    //         list.length === 0 || Object.keys(map).length === list.length - 1,
    //         "INTERNAL ERROR there is no junk in map"
    //     )
    // }

    function addObserver(observable, node) {
      // invariant(node.dependenciesState !== -1, "INTERNAL ERROR, can add only dependenciesState !== -1");
      // invariant(observable._observers.indexOf(node) === -1, "INTERNAL ERROR add already added node");
      // invariantObservers(observable);
      observable.observers_.add(node);
      if (observable.lowestObserverState_ > node.dependenciesState_) observable.lowestObserverState_ = node.dependenciesState_; // invariantObservers(observable);
      // invariant(observable._observers.indexOf(node) !== -1, "INTERNAL ERROR didn't add node");
    }
    function removeObserver(observable, node) {
      // invariant(globalState.inBatch > 0, "INTERNAL ERROR, remove should be called only inside batch");
      // invariant(observable._observers.indexOf(node) !== -1, "INTERNAL ERROR remove already removed node");
      // invariantObservers(observable);
      observable.observers_["delete"](node);

      if (observable.observers_.size === 0) {
        // deleting last observer
        queueForUnobservation(observable);
      } // invariantObservers(observable);
      // invariant(observable._observers.indexOf(node) === -1, "INTERNAL ERROR remove already removed node2");

    }
    function queueForUnobservation(observable) {
      if (observable.isPendingUnobservation_ === false) {
        // invariant(observable._observers.length === 0, "INTERNAL ERROR, should only queue for unobservation unobserved observables");
        observable.isPendingUnobservation_ = true;
        globalState.pendingUnobservations.push(observable);
      }
    }
    /**
     * Batch starts a transaction, at least for purposes of memoizing ComputedValues when nothing else does.
     * During a batch `onBecomeUnobserved` will be called at most once per observable.
     * Avoids unnecessary recalculations.
     */

    function startBatch() {
      globalState.inBatch++;
    }
    function endBatch() {
      if (--globalState.inBatch === 0) {
        runReactions(); // the batch is actually about to finish, all unobserving should happen here.

        var list = globalState.pendingUnobservations;

        for (var i = 0; i < list.length; i++) {
          var observable = list[i];
          observable.isPendingUnobservation_ = false;

          if (observable.observers_.size === 0) {
            if (observable.isBeingObserved_) {
              // if this observable had reactive observers, trigger the hooks
              observable.isBeingObserved_ = false;
              observable.onBUO();
            }

            if (observable instanceof ComputedValue) {
              // computed values are automatically teared down when the last observer leaves
              // this process happens recursively, this computed might be the last observabe of another, etc..
              observable.suspend_();
            }
          }
        }

        globalState.pendingUnobservations = [];
      }
    }
    function reportObserved(observable) {
      checkIfStateReadsAreAllowed(observable);
      var derivation = globalState.trackingDerivation;

      if (derivation !== null) {
        /**
         * Simple optimization, give each derivation run an unique id (runId)
         * Check if last time this observable was accessed the same runId is used
         * if this is the case, the relation is already known
         */
        if (derivation.runId_ !== observable.lastAccessedBy_) {
          observable.lastAccessedBy_ = derivation.runId_; // Tried storing newObserving, or observing, or both as Set, but performance didn't come close...

          derivation.newObserving_[derivation.unboundDepsCount_++] = observable;

          if (!observable.isBeingObserved_ && globalState.trackingContext) {
            observable.isBeingObserved_ = true;
            observable.onBO();
          }
        }

        return true;
      } else if (observable.observers_.size === 0 && globalState.inBatch > 0) {
        queueForUnobservation(observable);
      }

      return false;
    } // function invariantLOS(observable: IObservable, msg: string) {
    //     // it's expensive so better not run it in produciton. but temporarily helpful for testing
    //     const min = getObservers(observable).reduce((a, b) => Math.min(a, b.dependenciesState), 2)
    //     if (min >= observable.lowestObserverState) return // <- the only assumption about `lowestObserverState`
    //     throw new Error(
    //         "lowestObserverState is wrong for " +
    //             msg +
    //             " because " +
    //             min +
    //             " < " +
    //             observable.lowestObserverState
    //     )
    // }

    /**
     * NOTE: current propagation mechanism will in case of self reruning autoruns behave unexpectedly
     * It will propagate changes to observers from previous run
     * It's hard or maybe impossible (with reasonable perf) to get it right with current approach
     * Hopefully self reruning autoruns aren't a feature people should depend on
     * Also most basic use cases should be ok
     */
    // Called by Atom when its value changes

    function propagateChanged(observable) {
      // invariantLOS(observable, "changed start");
      if (observable.lowestObserverState_ === IDerivationState_.STALE_) return;
      observable.lowestObserverState_ = IDerivationState_.STALE_; // Ideally we use for..of here, but the downcompiled version is really slow...

      observable.observers_.forEach(function (d) {
        if (d.dependenciesState_ === IDerivationState_.UP_TO_DATE_) {
          if ( d.isTracing_ !== TraceMode.NONE) {
            logTraceInfo(d, observable);
          }

          d.onBecomeStale_();
        }

        d.dependenciesState_ = IDerivationState_.STALE_;
      }); // invariantLOS(observable, "changed end");
    } // Called by ComputedValue when it recalculate and its value changed

    function propagateChangeConfirmed(observable) {
      // invariantLOS(observable, "confirmed start");
      if (observable.lowestObserverState_ === IDerivationState_.STALE_) return;
      observable.lowestObserverState_ = IDerivationState_.STALE_;
      observable.observers_.forEach(function (d) {
        if (d.dependenciesState_ === IDerivationState_.POSSIBLY_STALE_) d.dependenciesState_ = IDerivationState_.STALE_;else if (d.dependenciesState_ === IDerivationState_.UP_TO_DATE_ // this happens during computing of `d`, just keep lowestObserverState up to date.
        ) observable.lowestObserverState_ = IDerivationState_.UP_TO_DATE_;
      }); // invariantLOS(observable, "confirmed end");
    } // Used by computed when its dependency changed, but we don't wan't to immediately recompute.

    function propagateMaybeChanged(observable) {
      // invariantLOS(observable, "maybe start");
      if (observable.lowestObserverState_ !== IDerivationState_.UP_TO_DATE_) return;
      observable.lowestObserverState_ = IDerivationState_.POSSIBLY_STALE_;
      observable.observers_.forEach(function (d) {
        if (d.dependenciesState_ === IDerivationState_.UP_TO_DATE_) {
          d.dependenciesState_ = IDerivationState_.POSSIBLY_STALE_;

          if ( d.isTracing_ !== TraceMode.NONE) {
            logTraceInfo(d, observable);
          }

          d.onBecomeStale_();
        }
      }); // invariantLOS(observable, "maybe end");
    }

    function logTraceInfo(derivation, observable) {
      console.log("[mobx.trace] '" + derivation.name_ + "' is invalidated due to a change in: '" + observable.name_ + "'");

      if (derivation.isTracing_ === TraceMode.BREAK) {
        var lines = [];
        printDepTree(getDependencyTree(derivation), lines, 1); // prettier-ignore

        new Function("debugger;\n/*\nTracing '" + derivation.name_ + "'\n\nYou are entering this break point because derivation '" + derivation.name_ + "' is being traced and '" + observable.name_ + "' is now forcing it to update.\nJust follow the stacktrace you should now see in the devtools to see precisely what piece of your code is causing this update\nThe stackframe you are looking for is at least ~6-8 stack-frames up.\n\n" + (derivation instanceof ComputedValue ? derivation.derivation.toString().replace(/[*]\//g, "/") : "") + "\n\nThe dependencies for this derivation are:\n\n" + lines.join("\n") + "\n*/\n    ")();
      }
    }

    function printDepTree(tree, lines, depth) {
      if (lines.length >= 1000) {
        lines.push("(and many more)");
        return;
      }

      lines.push("" + new Array(depth).join("\t") + tree.name); // MWE: not the fastest, but the easiest way :)

      if (tree.dependencies) tree.dependencies.forEach(function (child) {
        return printDepTree(child, lines, depth + 1);
      });
    }

    var Reaction = /*#__PURE__*/function () {
      // nodes we are looking at. Our value depends on these nodes
      function Reaction(name_, onInvalidate_, errorHandler_, requiresObservable_) {
        if (name_ === void 0) {
          name_ = "Reaction@" + getNextId();
        }

        if (requiresObservable_ === void 0) {
          requiresObservable_ = false;
        }

        this.name_ = void 0;
        this.onInvalidate_ = void 0;
        this.errorHandler_ = void 0;
        this.requiresObservable_ = void 0;
        this.observing_ = [];
        this.newObserving_ = [];
        this.dependenciesState_ = IDerivationState_.NOT_TRACKING_;
        this.diffValue_ = 0;
        this.runId_ = 0;
        this.unboundDepsCount_ = 0;
        this.mapid_ = "#" + getNextId();
        this.isDisposed_ = false;
        this.isScheduled_ = false;
        this.isTrackPending_ = false;
        this.isRunning_ = false;
        this.isTracing_ = TraceMode.NONE;
        this.name_ = name_;
        this.onInvalidate_ = onInvalidate_;
        this.errorHandler_ = errorHandler_;
        this.requiresObservable_ = requiresObservable_;
      }

      var _proto = Reaction.prototype;

      _proto.onBecomeStale_ = function onBecomeStale_() {
        this.schedule_();
      };

      _proto.schedule_ = function schedule_() {
        if (!this.isScheduled_) {
          this.isScheduled_ = true;
          globalState.pendingReactions.push(this);
          runReactions();
        }
      };

      _proto.isScheduled = function isScheduled() {
        return this.isScheduled_;
      }
      /**
       * internal, use schedule() if you intend to kick off a reaction
       */
      ;

      _proto.runReaction_ = function runReaction_() {
        if (!this.isDisposed_) {
          startBatch();
          this.isScheduled_ = false;
          var prev = globalState.trackingContext;
          globalState.trackingContext = this;

          if (shouldCompute(this)) {
            this.isTrackPending_ = true;

            try {
              this.onInvalidate_();

              if ("development" !== "production" && this.isTrackPending_ && isSpyEnabled()) {
                // onInvalidate didn't trigger track right away..
                spyReport({
                  name: this.name_,
                  type: "scheduled-reaction"
                });
              }
            } catch (e) {
              this.reportExceptionInDerivation_(e);
            }
          }

          globalState.trackingContext = prev;
          endBatch();
        }
      };

      _proto.track = function track(fn) {
        if (this.isDisposed_) {
          return; // console.warn("Reaction already disposed") // Note: Not a warning / error in mobx 4 either
        }

        startBatch();
        var notify = isSpyEnabled();
        var startTime;

        if ( notify) {
          startTime = Date.now();
          spyReportStart({
            name: this.name_,
            type: "reaction"
          });
        }

        this.isRunning_ = true;
        var prevReaction = globalState.trackingContext; // reactions could create reactions...

        globalState.trackingContext = this;
        var result = trackDerivedFunction(this, fn, undefined);
        globalState.trackingContext = prevReaction;
        this.isRunning_ = false;
        this.isTrackPending_ = false;

        if (this.isDisposed_) {
          // disposed during last run. Clean up everything that was bound after the dispose call.
          clearObserving(this);
        }

        if (isCaughtException(result)) this.reportExceptionInDerivation_(result.cause);

        if ( notify) {
          spyReportEnd({
            time: Date.now() - startTime
          });
        }

        endBatch();
      };

      _proto.reportExceptionInDerivation_ = function reportExceptionInDerivation_(error) {
        var _this = this;

        if (this.errorHandler_) {
          this.errorHandler_(error, this);
          return;
        }

        if (globalState.disableErrorBoundaries) throw error;
        var message =  "[mobx] Encountered an uncaught exception that was thrown by a reaction or observer component, in: '" + this + "'" ;

        if (!globalState.suppressReactionErrors) {
          console.error(message, error);
          /** If debugging brought you here, please, read the above message :-). Tnx! */
        } else console.warn("[mobx] (error in reaction '" + this.name_ + "' suppressed, fix error of causing action below)"); // prettier-ignore


        if ( isSpyEnabled()) {
          spyReport({
            type: "error",
            name: this.name_,
            message: message,
            error: "" + error
          });
        }

        globalState.globalReactionErrorHandlers.forEach(function (f) {
          return f(error, _this);
        });
      };

      _proto.dispose = function dispose() {
        if (!this.isDisposed_) {
          this.isDisposed_ = true;

          if (!this.isRunning_) {
            // if disposed while running, clean up later. Maybe not optimal, but rare case
            startBatch();
            clearObserving(this);
            endBatch();
          }
        }
      };

      _proto.getDisposer_ = function getDisposer_() {
        var r = this.dispose.bind(this);
        r[$mobx] = this;
        return r;
      };

      _proto.toString = function toString() {
        return "Reaction[" + this.name_ + "]";
      };

      _proto.trace = function trace$1(enterBreakPoint) {
        if (enterBreakPoint === void 0) {
          enterBreakPoint = false;
        }

        trace(this, enterBreakPoint);
      };

      return Reaction;
    }();
    /**
     * Magic number alert!
     * Defines within how many times a reaction is allowed to re-trigger itself
     * until it is assumed that this is gonna be a never ending loop...
     */

    var MAX_REACTION_ITERATIONS = 100;

    var reactionScheduler = function reactionScheduler(f) {
      return f();
    };

    function runReactions() {
      // Trampolining, if runReactions are already running, new reactions will be picked up
      if (globalState.inBatch > 0 || globalState.isRunningReactions) return;
      reactionScheduler(runReactionsHelper);
    }

    function runReactionsHelper() {
      globalState.isRunningReactions = true;
      var allReactions = globalState.pendingReactions;
      var iterations = 0; // While running reactions, new reactions might be triggered.
      // Hence we work with two variables and check whether
      // we converge to no remaining reactions after a while.

      while (allReactions.length > 0) {
        if (++iterations === MAX_REACTION_ITERATIONS) {
          console.error( "Reaction doesn't converge to a stable state after " + MAX_REACTION_ITERATIONS + " iterations." + (" Probably there is a cycle in the reactive function: " + allReactions[0]) );
          allReactions.splice(0); // clear reactions
        }

        var remainingReactions = allReactions.splice(0);

        for (var i = 0, l = remainingReactions.length; i < l; i++) {
          remainingReactions[i].runReaction_();
        }
      }

      globalState.isRunningReactions = false;
    }

    var isReaction = /*#__PURE__*/createInstanceofPredicate("Reaction", Reaction);

    function isSpyEnabled() {
      return  !!globalState.spyListeners.length;
    }
    function spyReport(event) {

      if (!globalState.spyListeners.length) return;
      var listeners = globalState.spyListeners;

      for (var i = 0, l = listeners.length; i < l; i++) {
        listeners[i](event);
      }
    }
    function spyReportStart(event) {

      var change = _extends({}, event, {
        spyReportStart: true
      });

      spyReport(change);
    }
    var END_EVENT = {
      type: "report-end",
      spyReportEnd: true
    };
    function spyReportEnd(change) {
      if (change) spyReport(_extends({}, change, {
        type: "report-end",
        spyReportEnd: true
      }));else spyReport(END_EVENT);
    }
    function spy(listener) {
      {
        globalState.spyListeners.push(listener);
        return once(function () {
          globalState.spyListeners = globalState.spyListeners.filter(function (l) {
            return l !== listener;
          });
        });
      }
    }

    var ACTION = "action";
    var ACTION_BOUND = "action.bound";
    var AUTOACTION = "autoAction";
    var AUTOACTION_BOUND = "autoAction.bound";
    var DEFAULT_ACTION_NAME = "<unnamed action>";
    var actionAnnotation = /*#__PURE__*/createActionAnnotation(ACTION);
    var actionBoundAnnotation = /*#__PURE__*/createActionAnnotation(ACTION_BOUND, {
      bound: true
    });
    var autoActionAnnotation = /*#__PURE__*/createActionAnnotation(AUTOACTION, {
      autoAction: true
    });
    var autoActionBoundAnnotation = /*#__PURE__*/createActionAnnotation(AUTOACTION_BOUND, {
      autoAction: true,
      bound: true
    });

    function createActionFactory(autoAction) {
      var res = function action(arg1, arg2) {
        // action(fn() {})
        if (isFunction(arg1)) return createAction(arg1.name || DEFAULT_ACTION_NAME, arg1, autoAction); // action("name", fn() {})

        if (isFunction(arg2)) return createAction(arg1, arg2, autoAction); // @action

        if (isStringish(arg2)) {
          return storeAnnotation(arg1, arg2, autoAction ? autoActionAnnotation : actionAnnotation);
        } // action("name") & @action("name")


        if (isStringish(arg1)) {
          return createDecoratorAnnotation(createActionAnnotation(autoAction ? AUTOACTION : ACTION, {
            name: arg1,
            autoAction: autoAction
          }));
        }

        die("Invalid arguments for `action`");
      };

      return res;
    }

    var action = /*#__PURE__*/createActionFactory(false);
    Object.assign(action, actionAnnotation);
    var autoAction = /*#__PURE__*/createActionFactory(true);
    Object.assign(autoAction, autoActionAnnotation);
    action.bound = /*#__PURE__*/createDecoratorAnnotation(actionBoundAnnotation);
    autoAction.bound = /*#__PURE__*/createDecoratorAnnotation(autoActionBoundAnnotation);
    function isAction(thing) {
      return isFunction(thing) && thing.isMobxAction === true;
    }

    /**
     * Creates a named reactive view and keeps it alive, so that the view is always
     * updated if one of the dependencies changes, even when the view is not further used by something else.
     * @param view The reactive view
     * @returns disposer function, which can be used to stop the view from being updated in the future.
     */

    function autorun(view, opts) {
      if (opts === void 0) {
        opts = EMPTY_OBJECT;
      }

      {
        if (!isFunction(view)) die("Autorun expects a function as first argument");
        if (isAction(view)) die("Autorun does not accept actions since actions are untrackable");
      }

      var name = opts && opts.name || view.name || "Autorun@" + getNextId();
      var runSync = !opts.scheduler && !opts.delay;
      var reaction;

      if (runSync) {
        // normal autorun
        reaction = new Reaction(name, function () {
          this.track(reactionRunner);
        }, opts.onError, opts.requiresObservable);
      } else {
        var scheduler = createSchedulerFromOptions(opts); // debounced autorun

        var isScheduled = false;
        reaction = new Reaction(name, function () {
          if (!isScheduled) {
            isScheduled = true;
            scheduler(function () {
              isScheduled = false;
              if (!reaction.isDisposed_) reaction.track(reactionRunner);
            });
          }
        }, opts.onError, opts.requiresObservable);
      }

      function reactionRunner() {
        view(reaction);
      }

      reaction.schedule_();
      return reaction.getDisposer_();
    }

    var run$1 = function run(f) {
      return f();
    };

    function createSchedulerFromOptions(opts) {
      return opts.scheduler ? opts.scheduler : opts.delay ? function (f) {
        return setTimeout(f, opts.delay);
      } : run$1;
    }

    var ON_BECOME_OBSERVED = "onBO";
    var ON_BECOME_UNOBSERVED = "onBUO";
    function onBecomeObserved(thing, arg2, arg3) {
      return interceptHook(ON_BECOME_OBSERVED, thing, arg2, arg3);
    }
    function onBecomeUnobserved(thing, arg2, arg3) {
      return interceptHook(ON_BECOME_UNOBSERVED, thing, arg2, arg3);
    }

    function interceptHook(hook, thing, arg2, arg3) {
      var atom = typeof arg3 === "function" ? getAtom(thing, arg2) : getAtom(thing);
      var cb = isFunction(arg3) ? arg3 : arg2;
      var listenersKey = hook + "L";

      if (atom[listenersKey]) {
        atom[listenersKey].add(cb);
      } else {
        atom[listenersKey] = new Set([cb]);
      }

      return function () {
        var hookListeners = atom[listenersKey];

        if (hookListeners) {
          hookListeners["delete"](cb);

          if (hookListeners.size === 0) {
            delete atom[listenersKey];
          }
        }
      };
    }

    function extendObservable(target, properties, annotations, options) {
      {
        if (arguments.length > 4) die("'extendObservable' expected 2-4 arguments");
        if (typeof target !== "object") die("'extendObservable' expects an object as first argument");
        if (isObservableMap(target)) die("'extendObservable' should not be used on maps, use map.merge instead");
        if (!isPlainObject(properties)) die("'extendObservabe' only accepts plain objects as second argument");
        if (isObservable(properties) || isObservable(annotations)) die("Extending an object with another observable (object) is not supported");
      } // Pull descriptors first, so we don't have to deal with props added by administration ($mobx)


      var descriptors = getOwnPropertyDescriptors(properties);
      var adm = asObservableObject(target, options)[$mobx];
      startBatch();

      try {
        ownKeys(descriptors).forEach(function (key) {
          adm.extend_(key, descriptors[key], // must pass "undefined" for { key: undefined }
          !annotations ? true : key in annotations ? annotations[key] : true);
        });
      } finally {
        endBatch();
      }

      return target;
    }

    function getDependencyTree(thing, property) {
      return nodeToDependencyTree(getAtom(thing, property));
    }

    function nodeToDependencyTree(node) {
      var result = {
        name: node.name_
      };
      if (node.observing_ && node.observing_.length > 0) result.dependencies = unique(node.observing_).map(nodeToDependencyTree);
      return result;
    }

    function unique(list) {
      return Array.from(new Set(list));
    }

    var generatorId = 0;
    function FlowCancellationError() {
      this.message = "FLOW_CANCELLED";
    }
    FlowCancellationError.prototype = /*#__PURE__*/Object.create(Error.prototype);
    var flowAnnotation = /*#__PURE__*/createFlowAnnotation("flow");
    var flow = /*#__PURE__*/Object.assign(function flow(arg1, arg2) {
      // @flow
      if (isStringish(arg2)) {
        return storeAnnotation(arg1, arg2, flowAnnotation);
      } // flow(fn)


      if ( arguments.length !== 1) die("Flow expects single argument with generator function");
      var generator = arg1;
      var name = generator.name || "<unnamed flow>"; // Implementation based on https://github.com/tj/co/blob/master/index.js

      var res = function res() {
        var ctx = this;
        var args = arguments;
        var runId = ++generatorId;
        var gen = action(name + " - runid: " + runId + " - init", generator).apply(ctx, args);
        var rejector;
        var pendingPromise = undefined;
        var promise = new Promise(function (resolve, reject) {
          var stepId = 0;
          rejector = reject;

          function onFulfilled(res) {
            pendingPromise = undefined;
            var ret;

            try {
              ret = action(name + " - runid: " + runId + " - yield " + stepId++, gen.next).call(gen, res);
            } catch (e) {
              return reject(e);
            }

            next(ret);
          }

          function onRejected(err) {
            pendingPromise = undefined;
            var ret;

            try {
              ret = action(name + " - runid: " + runId + " - yield " + stepId++, gen["throw"]).call(gen, err);
            } catch (e) {
              return reject(e);
            }

            next(ret);
          }

          function next(ret) {
            if (isFunction(ret == null ? void 0 : ret.then)) {
              // an async iterator
              ret.then(next, reject);
              return;
            }

            if (ret.done) return resolve(ret.value);
            pendingPromise = Promise.resolve(ret.value);
            return pendingPromise.then(onFulfilled, onRejected);
          }

          onFulfilled(undefined); // kick off the process
        });
        promise.cancel = action(name + " - runid: " + runId + " - cancel", function () {
          try {
            if (pendingPromise) cancelPromise(pendingPromise); // Finally block can return (or yield) stuff..

            var _res = gen["return"](undefined); // eat anything that promise would do, it's cancelled!


            var yieldedPromise = Promise.resolve(_res.value);
            yieldedPromise.then(noop$1, noop$1);
            cancelPromise(yieldedPromise); // maybe it can be cancelled :)
            // reject our original promise

            rejector(new FlowCancellationError());
          } catch (e) {
            rejector(e); // there could be a throwing finally block
          }
        });
        return promise;
      };

      res.isMobXFlow = true;
      return res;
    }, flowAnnotation);

    function cancelPromise(promise) {
      if (isFunction(promise.cancel)) promise.cancel();
    }
    function isFlow(fn) {
      return (fn == null ? void 0 : fn.isMobXFlow) === true;
    }

    function _isObservable(value, property) {
      if (!value) return false;

      if (property !== undefined) {
        if ( (isObservableMap(value) || isObservableArray(value))) return die("isObservable(object, propertyName) is not supported for arrays and maps. Use map.has or array.length instead.");

        if (isObservableObject(value)) {
          return value[$mobx].values_.has(property);
        }

        return false;
      } // For first check, see #701


      return isObservableObject(value) || !!value[$mobx] || isAtom(value) || isReaction(value) || isComputedValue(value);
    }

    function isObservable(value) {
      if ( arguments.length !== 1) die("isObservable expects only 1 argument. Use isObservableProp to inspect the observability of a property");
      return _isObservable(value);
    }

    function trace() {
      var enterBreakPoint = false;

      for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
        args[_key] = arguments[_key];
      }

      if (typeof args[args.length - 1] === "boolean") enterBreakPoint = args.pop();
      var derivation = getAtomFromArgs(args);

      if (!derivation) {
        return die("'trace(break?)' can only be used inside a tracked computed value or a Reaction. Consider passing in the computed value or reaction explicitly");
      }

      if (derivation.isTracing_ === TraceMode.NONE) {
        console.log("[mobx.trace] '" + derivation.name_ + "' tracing enabled");
      }

      derivation.isTracing_ = enterBreakPoint ? TraceMode.BREAK : TraceMode.LOG;
    }

    function getAtomFromArgs(args) {
      switch (args.length) {
        case 0:
          return globalState.trackingDerivation;

        case 1:
          return getAtom(args[0]);

        case 2:
          return getAtom(args[0], args[1]);
      }
    }

    /**
     * During a transaction no views are updated until the end of the transaction.
     * The transaction will be run synchronously nonetheless.
     *
     * @param action a function that updates some reactive state
     * @returns any value that was returned by the 'action' parameter.
     */

    function transaction(action, thisArg) {
      if (thisArg === void 0) {
        thisArg = undefined;
      }

      startBatch();

      try {
        return action.apply(thisArg);
      } finally {
        endBatch();
      }
    }

    function getAdm(target) {
      return target[$mobx];
    } // Optimization: we don't need the intermediate objects and could have a completely custom administration for DynamicObjects,
    // and skip either the internal values map, or the base object with its property descriptors!


    var objectProxyTraps = {
      has: function has(target, name) {
        if ( globalState.trackingDerivation) warnAboutProxyRequirement("detect new properties using the 'in' operator. Use 'has' from 'mobx' instead.");
        return getAdm(target).has_(name);
      },
      get: function get(target, name) {
        return getAdm(target).get_(name);
      },
      set: function set(target, name, value) {
        var _getAdm$set_;

        if (!isStringish(name)) return false;

        if ( !getAdm(target).values_.has(name)) {
          warnAboutProxyRequirement("add a new observable property through direct assignment. Use 'set' from 'mobx' instead.");
        } // null (intercepted) -> true (success)


        return (_getAdm$set_ = getAdm(target).set_(name, value, true)) != null ? _getAdm$set_ : true;
      },
      deleteProperty: function deleteProperty(target, name) {
        var _getAdm$delete_;

        {
          warnAboutProxyRequirement("delete properties from an observable object. Use 'remove' from 'mobx' instead.");
        }

        if (!isStringish(name)) return false; // null (intercepted) -> true (success)

        return (_getAdm$delete_ = getAdm(target).delete_(name, true)) != null ? _getAdm$delete_ : true;
      },
      defineProperty: function defineProperty(target, name, descriptor) {
        var _getAdm$definePropert;

        {
          warnAboutProxyRequirement("define property on an observable object. Use 'defineProperty' from 'mobx' instead.");
        } // null (intercepted) -> true (success)


        return (_getAdm$definePropert = getAdm(target).defineProperty_(name, descriptor)) != null ? _getAdm$definePropert : true;
      },
      ownKeys: function ownKeys(target) {
        if ( globalState.trackingDerivation) warnAboutProxyRequirement("iterate keys to detect added / removed properties. Use `keys` from 'mobx' instead.");
        return getAdm(target).ownKeys_();
      },
      preventExtensions: function preventExtensions(target) {
        die(13);
      }
    };
    function asDynamicObservableObject(target, options) {
      var _target$$mobx, _target$$mobx$proxy_;

      assertProxies();
      target = asObservableObject(target, options);
      return (_target$$mobx$proxy_ = (_target$$mobx = target[$mobx]).proxy_) != null ? _target$$mobx$proxy_ : _target$$mobx.proxy_ = new Proxy(target, objectProxyTraps);
    }

    function hasInterceptors(interceptable) {
      return interceptable.interceptors_ !== undefined && interceptable.interceptors_.length > 0;
    }
    function registerInterceptor(interceptable, handler) {
      var interceptors = interceptable.interceptors_ || (interceptable.interceptors_ = []);
      interceptors.push(handler);
      return once(function () {
        var idx = interceptors.indexOf(handler);
        if (idx !== -1) interceptors.splice(idx, 1);
      });
    }
    function interceptChange(interceptable, change) {
      var prevU = untrackedStart();

      try {
        // Interceptor can modify the array, copy it to avoid concurrent modification, see #1950
        var interceptors = [].concat(interceptable.interceptors_ || []);

        for (var i = 0, l = interceptors.length; i < l; i++) {
          change = interceptors[i](change);
          if (change && !change.type) die(14);
          if (!change) break;
        }

        return change;
      } finally {
        untrackedEnd(prevU);
      }
    }

    function hasListeners(listenable) {
      return listenable.changeListeners_ !== undefined && listenable.changeListeners_.length > 0;
    }
    function registerListener(listenable, handler) {
      var listeners = listenable.changeListeners_ || (listenable.changeListeners_ = []);
      listeners.push(handler);
      return once(function () {
        var idx = listeners.indexOf(handler);
        if (idx !== -1) listeners.splice(idx, 1);
      });
    }
    function notifyListeners(listenable, change) {
      var prevU = untrackedStart();
      var listeners = listenable.changeListeners_;
      if (!listeners) return;
      listeners = listeners.slice();

      for (var i = 0, l = listeners.length; i < l; i++) {
        listeners[i](change);
      }

      untrackedEnd(prevU);
    }

    function makeObservable(target, annotations, options) {
      var adm = asObservableObject(target, options)[$mobx];
      startBatch();

      try {
        var _annotations;

        // Default to decorators
        (_annotations = annotations) != null ? _annotations : annotations = collectStoredAnnotations(target); // Annotate

        ownKeys(annotations).forEach(function (key) {
          return adm.make_(key, annotations[key]);
        });
      } finally {
        endBatch();
      }

      return target;
    }

    var SPLICE = "splice";
    var UPDATE = "update";
    var MAX_SPLICE_SIZE = 10000; // See e.g. https://github.com/mobxjs/mobx/issues/859

    var arrayTraps = {
      get: function get(target, name) {
        var adm = target[$mobx];
        if (name === $mobx) return adm;
        if (name === "length") return adm.getArrayLength_();

        if (typeof name === "string" && !isNaN(name)) {
          return adm.get_(parseInt(name));
        }

        if (hasProp(arrayExtensions, name)) {
          return arrayExtensions[name];
        }

        return target[name];
      },
      set: function set(target, name, value) {
        var adm = target[$mobx];

        if (name === "length") {
          adm.setArrayLength_(value);
        }

        if (typeof name === "symbol" || isNaN(name)) {
          target[name] = value;
        } else {
          // numeric string
          adm.set_(parseInt(name), value);
        }

        return true;
      },
      preventExtensions: function preventExtensions() {
        die(15);
      }
    };
    var ObservableArrayAdministration = /*#__PURE__*/function () {
      // this is the prop that gets proxied, so can't replace it!
      function ObservableArrayAdministration(name, enhancer, owned_, legacyMode_) {
        this.owned_ = void 0;
        this.legacyMode_ = void 0;
        this.atom_ = void 0;
        this.values_ = [];
        this.interceptors_ = void 0;
        this.changeListeners_ = void 0;
        this.enhancer_ = void 0;
        this.dehancer = void 0;
        this.proxy_ = void 0;
        this.lastKnownLength_ = 0;
        this.owned_ = owned_;
        this.legacyMode_ = legacyMode_;
        this.atom_ = new Atom(name || "ObservableArray@" + getNextId());

        this.enhancer_ = function (newV, oldV) {
          return enhancer(newV, oldV, name + "[..]");
        };
      }

      var _proto = ObservableArrayAdministration.prototype;

      _proto.dehanceValue_ = function dehanceValue_(value) {
        if (this.dehancer !== undefined) return this.dehancer(value);
        return value;
      };

      _proto.dehanceValues_ = function dehanceValues_(values) {
        if (this.dehancer !== undefined && values.length > 0) return values.map(this.dehancer);
        return values;
      };

      _proto.intercept_ = function intercept_(handler) {
        return registerInterceptor(this, handler);
      };

      _proto.observe_ = function observe_(listener, fireImmediately) {
        if (fireImmediately === void 0) {
          fireImmediately = false;
        }

        if (fireImmediately) {
          listener({
            observableKind: "array",
            object: this.proxy_,
            debugObjectName: this.atom_.name_,
            type: "splice",
            index: 0,
            added: this.values_.slice(),
            addedCount: this.values_.length,
            removed: [],
            removedCount: 0
          });
        }

        return registerListener(this, listener);
      };

      _proto.getArrayLength_ = function getArrayLength_() {
        this.atom_.reportObserved();
        return this.values_.length;
      };

      _proto.setArrayLength_ = function setArrayLength_(newLength) {
        if (typeof newLength !== "number" || newLength < 0) die("Out of range: " + newLength);
        var currentLength = this.values_.length;
        if (newLength === currentLength) return;else if (newLength > currentLength) {
          var newItems = new Array(newLength - currentLength);

          for (var i = 0; i < newLength - currentLength; i++) {
            newItems[i] = undefined;
          } // No Array.fill everywhere...


          this.spliceWithArray_(currentLength, 0, newItems);
        } else this.spliceWithArray_(newLength, currentLength - newLength);
      };

      _proto.updateArrayLength_ = function updateArrayLength_(oldLength, delta) {
        if (oldLength !== this.lastKnownLength_) die(16);
        this.lastKnownLength_ += delta;
        if (this.legacyMode_ && delta > 0) reserveArrayBuffer(oldLength + delta + 1);
      };

      _proto.spliceWithArray_ = function spliceWithArray_(index, deleteCount, newItems) {
        var _this = this;

        checkIfStateModificationsAreAllowed(this.atom_);
        var length = this.values_.length;
        if (index === undefined) index = 0;else if (index > length) index = length;else if (index < 0) index = Math.max(0, length + index);
        if (arguments.length === 1) deleteCount = length - index;else if (deleteCount === undefined || deleteCount === null) deleteCount = 0;else deleteCount = Math.max(0, Math.min(deleteCount, length - index));
        if (newItems === undefined) newItems = EMPTY_ARRAY;

        if (hasInterceptors(this)) {
          var change = interceptChange(this, {
            object: this.proxy_,
            type: SPLICE,
            index: index,
            removedCount: deleteCount,
            added: newItems
          });
          if (!change) return EMPTY_ARRAY;
          deleteCount = change.removedCount;
          newItems = change.added;
        }

        newItems = newItems.length === 0 ? newItems : newItems.map(function (v) {
          return _this.enhancer_(v, undefined);
        });

        if (this.legacyMode_ || "development" !== "production") {
          var lengthDelta = newItems.length - deleteCount;
          this.updateArrayLength_(length, lengthDelta); // checks if internal array wasn't modified
        }

        var res = this.spliceItemsIntoValues_(index, deleteCount, newItems);
        if (deleteCount !== 0 || newItems.length !== 0) this.notifyArraySplice_(index, newItems, res);
        return this.dehanceValues_(res);
      };

      _proto.spliceItemsIntoValues_ = function spliceItemsIntoValues_(index, deleteCount, newItems) {
        if (newItems.length < MAX_SPLICE_SIZE) {
          var _this$values_;

          return (_this$values_ = this.values_).splice.apply(_this$values_, [index, deleteCount].concat(newItems));
        } else {
          var res = this.values_.slice(index, index + deleteCount);
          var oldItems = this.values_.slice(index + deleteCount);
          this.values_.length = index + newItems.length - deleteCount;

          for (var i = 0; i < newItems.length; i++) {
            this.values_[index + i] = newItems[i];
          }

          for (var _i = 0; _i < oldItems.length; _i++) {
            this.values_[index + newItems.length + _i] = oldItems[_i];
          }

          return res;
        }
      };

      _proto.notifyArrayChildUpdate_ = function notifyArrayChildUpdate_(index, newValue, oldValue) {
        var notifySpy = !this.owned_ && isSpyEnabled();
        var notify = hasListeners(this);
        var change = notify || notifySpy ? {
          observableKind: "array",
          object: this.proxy_,
          type: UPDATE,
          debugObjectName: this.atom_.name_,
          index: index,
          newValue: newValue,
          oldValue: oldValue
        } : null; // The reason why this is on right hand side here (and not above), is this way the uglifier will drop it, but it won't
        // cause any runtime overhead in development mode without NODE_ENV set, unless spying is enabled

        if ( notifySpy) spyReportStart(change);
        this.atom_.reportChanged();
        if (notify) notifyListeners(this, change);
        if ( notifySpy) spyReportEnd();
      };

      _proto.notifyArraySplice_ = function notifyArraySplice_(index, added, removed) {
        var notifySpy = !this.owned_ && isSpyEnabled();
        var notify = hasListeners(this);
        var change = notify || notifySpy ? {
          observableKind: "array",
          object: this.proxy_,
          debugObjectName: this.atom_.name_,
          type: SPLICE,
          index: index,
          removed: removed,
          added: added,
          removedCount: removed.length,
          addedCount: added.length
        } : null;
        if ( notifySpy) spyReportStart(change);
        this.atom_.reportChanged(); // conform: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/observe

        if (notify) notifyListeners(this, change);
        if ( notifySpy) spyReportEnd();
      };

      _proto.get_ = function get_(index) {
        if (index < this.values_.length) {
          this.atom_.reportObserved();
          return this.dehanceValue_(this.values_[index]);
        }

        console.warn( "[mobx] Out of bounds read: " + index );
      };

      _proto.set_ = function set_(index, newValue) {
        var values = this.values_;

        if (index < values.length) {
          // update at index in range
          checkIfStateModificationsAreAllowed(this.atom_);
          var oldValue = values[index];

          if (hasInterceptors(this)) {
            var change = interceptChange(this, {
              type: UPDATE,
              object: this.proxy_,
              index: index,
              newValue: newValue
            });
            if (!change) return;
            newValue = change.newValue;
          }

          newValue = this.enhancer_(newValue, oldValue);
          var changed = newValue !== oldValue;

          if (changed) {
            values[index] = newValue;
            this.notifyArrayChildUpdate_(index, newValue, oldValue);
          }
        } else if (index === values.length) {
          // add a new item
          this.spliceWithArray_(index, 0, [newValue]);
        } else {
          // out of bounds
          die(17, index, values.length);
        }
      };

      return ObservableArrayAdministration;
    }();
    function createObservableArray(initialValues, enhancer, name, owned) {
      if (name === void 0) {
        name = "ObservableArray@" + getNextId();
      }

      if (owned === void 0) {
        owned = false;
      }

      assertProxies();
      var adm = new ObservableArrayAdministration(name, enhancer, owned, false);
      addHiddenFinalProp(adm.values_, $mobx, adm);
      var proxy = new Proxy(adm.values_, arrayTraps);
      adm.proxy_ = proxy;

      if (initialValues && initialValues.length) {
        var prev = allowStateChangesStart(true);
        adm.spliceWithArray_(0, 0, initialValues);
        allowStateChangesEnd(prev);
      }

      return proxy;
    } // eslint-disable-next-line

    var arrayExtensions = {
      clear: function clear() {
        return this.splice(0);
      },
      replace: function replace(newItems) {
        var adm = this[$mobx];
        return adm.spliceWithArray_(0, adm.values_.length, newItems);
      },
      // Used by JSON.stringify
      toJSON: function toJSON() {
        return this.slice();
      },

      /*
       * functions that do alter the internal structure of the array, (based on lib.es6.d.ts)
       * since these functions alter the inner structure of the array, the have side effects.
       * Because the have side effects, they should not be used in computed function,
       * and for that reason the do not call dependencyState.notifyObserved
       */
      splice: function splice(index, deleteCount) {
        for (var _len = arguments.length, newItems = new Array(_len > 2 ? _len - 2 : 0), _key = 2; _key < _len; _key++) {
          newItems[_key - 2] = arguments[_key];
        }

        var adm = this[$mobx];

        switch (arguments.length) {
          case 0:
            return [];

          case 1:
            return adm.spliceWithArray_(index);

          case 2:
            return adm.spliceWithArray_(index, deleteCount);
        }

        return adm.spliceWithArray_(index, deleteCount, newItems);
      },
      spliceWithArray: function spliceWithArray(index, deleteCount, newItems) {
        return this[$mobx].spliceWithArray_(index, deleteCount, newItems);
      },
      push: function push() {
        var adm = this[$mobx];

        for (var _len2 = arguments.length, items = new Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
          items[_key2] = arguments[_key2];
        }

        adm.spliceWithArray_(adm.values_.length, 0, items);
        return adm.values_.length;
      },
      pop: function pop() {
        return this.splice(Math.max(this[$mobx].values_.length - 1, 0), 1)[0];
      },
      shift: function shift() {
        return this.splice(0, 1)[0];
      },
      unshift: function unshift() {
        var adm = this[$mobx];

        for (var _len3 = arguments.length, items = new Array(_len3), _key3 = 0; _key3 < _len3; _key3++) {
          items[_key3] = arguments[_key3];
        }

        adm.spliceWithArray_(0, 0, items);
        return adm.values_.length;
      },
      reverse: function reverse() {
        // reverse by default mutates in place before returning the result
        // which makes it both a 'derivation' and a 'mutation'.
        if (globalState.trackingDerivation) {
          die(37, "reverse");
        }

        this.replace(this.slice().reverse());
        return this;
      },
      sort: function sort() {
        // sort by default mutates in place before returning the result
        // which goes against all good practices. Let's not change the array in place!
        if (globalState.trackingDerivation) {
          die(37, "sort");
        }

        var copy = this.slice();
        copy.sort.apply(copy, arguments);
        this.replace(copy);
        return this;
      },
      remove: function remove(value) {
        var adm = this[$mobx];
        var idx = adm.dehanceValues_(adm.values_).indexOf(value);

        if (idx > -1) {
          this.splice(idx, 1);
          return true;
        }

        return false;
      }
    };
    /**
     * Wrap function from prototype
     * Without this, everything works as well, but this works
     * faster as everything works on unproxied values
     */

    addArrayExtension("concat", simpleFunc);
    addArrayExtension("flat", simpleFunc);
    addArrayExtension("includes", simpleFunc);
    addArrayExtension("indexOf", simpleFunc);
    addArrayExtension("join", simpleFunc);
    addArrayExtension("lastIndexOf", simpleFunc);
    addArrayExtension("slice", simpleFunc);
    addArrayExtension("toString", simpleFunc);
    addArrayExtension("toLocaleString", simpleFunc); // map

    addArrayExtension("every", mapLikeFunc);
    addArrayExtension("filter", mapLikeFunc);
    addArrayExtension("find", mapLikeFunc);
    addArrayExtension("findIndex", mapLikeFunc);
    addArrayExtension("flatMap", mapLikeFunc);
    addArrayExtension("forEach", mapLikeFunc);
    addArrayExtension("map", mapLikeFunc);
    addArrayExtension("some", mapLikeFunc); // reduce

    addArrayExtension("reduce", reduceLikeFunc);
    addArrayExtension("reduceRight", reduceLikeFunc);

    function addArrayExtension(funcName, funcFactory) {
      if (typeof Array.prototype[funcName] === "function") {
        arrayExtensions[funcName] = funcFactory(funcName);
      }
    } // Report and delegate to dehanced array


    function simpleFunc(funcName) {
      return function () {
        var adm = this[$mobx];
        adm.atom_.reportObserved();
        var dehancedValues = adm.dehanceValues_(adm.values_);
        return dehancedValues[funcName].apply(dehancedValues, arguments);
      };
    } // Make sure callbacks recieve correct array arg #2326


    function mapLikeFunc(funcName) {
      return function (callback, thisArg) {
        var _this2 = this;

        var adm = this[$mobx];
        adm.atom_.reportObserved();
        var dehancedValues = adm.dehanceValues_(adm.values_);
        return dehancedValues[funcName](function (element, index) {
          return callback.call(thisArg, element, index, _this2);
        });
      };
    } // Make sure callbacks recieve correct array arg #2326


    function reduceLikeFunc(funcName) {
      return function () {
        var _this3 = this;

        var adm = this[$mobx];
        adm.atom_.reportObserved();
        var dehancedValues = adm.dehanceValues_(adm.values_); // #2432 - reduce behavior depends on arguments.length

        var callback = arguments[0];

        arguments[0] = function (accumulator, currentValue, index) {
          return callback(accumulator, currentValue, index, _this3);
        };

        return dehancedValues[funcName].apply(dehancedValues, arguments);
      };
    }

    var isObservableArrayAdministration = /*#__PURE__*/createInstanceofPredicate("ObservableArrayAdministration", ObservableArrayAdministration);
    function isObservableArray(thing) {
      return isObject(thing) && isObservableArrayAdministration(thing[$mobx]);
    }

    var _Symbol$iterator, _Symbol$toStringTag;
    var ObservableMapMarker = {};
    var ADD = "add";
    var DELETE = "delete"; // just extend Map? See also https://gist.github.com/nestharus/13b4d74f2ef4a2f4357dbd3fc23c1e54
    // But: https://github.com/mobxjs/mobx/issues/1556

    _Symbol$iterator = Symbol.iterator;
    _Symbol$toStringTag = Symbol.toStringTag;
    var ObservableMap = /*#__PURE__*/function () {
      // hasMap, not hashMap >-).
      function ObservableMap(initialData, enhancer_, name_) {
        if (enhancer_ === void 0) {
          enhancer_ = deepEnhancer;
        }

        if (name_ === void 0) {
          name_ = "ObservableMap@" + getNextId();
        }

        this.enhancer_ = void 0;
        this.name_ = void 0;
        this[$mobx] = ObservableMapMarker;
        this.data_ = void 0;
        this.hasMap_ = void 0;
        this.keysAtom_ = void 0;
        this.interceptors_ = void 0;
        this.changeListeners_ = void 0;
        this.dehancer = void 0;
        this.enhancer_ = enhancer_;
        this.name_ = name_;

        if (!isFunction(Map)) {
          die(18);
        }

        this.keysAtom_ = createAtom(this.name_ + ".keys()");
        this.data_ = new Map();
        this.hasMap_ = new Map();
        this.merge(initialData);
      }

      var _proto = ObservableMap.prototype;

      _proto.has_ = function has_(key) {
        return this.data_.has(key);
      };

      _proto.has = function has(key) {
        var _this = this;

        if (!globalState.trackingDerivation) return this.has_(key);
        var entry = this.hasMap_.get(key);

        if (!entry) {
          var newEntry = entry = new ObservableValue(this.has_(key), referenceEnhancer, this.name_ + "." + stringifyKey(key) + "?", false);
          this.hasMap_.set(key, newEntry);
          onBecomeUnobserved(newEntry, function () {
            return _this.hasMap_["delete"](key);
          });
        }

        return entry.get();
      };

      _proto.set = function set(key, value) {
        var hasKey = this.has_(key);

        if (hasInterceptors(this)) {
          var change = interceptChange(this, {
            type: hasKey ? UPDATE : ADD,
            object: this,
            newValue: value,
            name: key
          });
          if (!change) return this;
          value = change.newValue;
        }

        if (hasKey) {
          this.updateValue_(key, value);
        } else {
          this.addValue_(key, value);
        }

        return this;
      };

      _proto["delete"] = function _delete(key) {
        var _this2 = this;

        checkIfStateModificationsAreAllowed(this.keysAtom_);

        if (hasInterceptors(this)) {
          var change = interceptChange(this, {
            type: DELETE,
            object: this,
            name: key
          });
          if (!change) return false;
        }

        if (this.has_(key)) {
          var notifySpy = isSpyEnabled();
          var notify = hasListeners(this);

          var _change = notify || notifySpy ? {
            observableKind: "map",
            debugObjectName: this.name_,
            type: DELETE,
            object: this,
            oldValue: this.data_.get(key).value_,
            name: key
          } : null;

          if ( notifySpy) spyReportStart(_change);
          transaction(function () {
            _this2.keysAtom_.reportChanged();

            _this2.updateHasMapEntry_(key, false);

            var observable = _this2.data_.get(key);

            observable.setNewValue_(undefined);

            _this2.data_["delete"](key);
          });
          if (notify) notifyListeners(this, _change);
          if ( notifySpy) spyReportEnd();
          return true;
        }

        return false;
      };

      _proto.updateHasMapEntry_ = function updateHasMapEntry_(key, value) {
        var entry = this.hasMap_.get(key);

        if (entry) {
          entry.setNewValue_(value);
        }
      };

      _proto.updateValue_ = function updateValue_(key, newValue) {
        var observable = this.data_.get(key);
        newValue = observable.prepareNewValue_(newValue);

        if (newValue !== globalState.UNCHANGED) {
          var notifySpy = isSpyEnabled();
          var notify = hasListeners(this);
          var change = notify || notifySpy ? {
            observableKind: "map",
            debugObjectName: this.name_,
            type: UPDATE,
            object: this,
            oldValue: observable.value_,
            name: key,
            newValue: newValue
          } : null;
          if ( notifySpy) spyReportStart(change);
          observable.setNewValue_(newValue);
          if (notify) notifyListeners(this, change);
          if ( notifySpy) spyReportEnd();
        }
      };

      _proto.addValue_ = function addValue_(key, newValue) {
        var _this3 = this;

        checkIfStateModificationsAreAllowed(this.keysAtom_);
        transaction(function () {
          var observable = new ObservableValue(newValue, _this3.enhancer_, _this3.name_ + "." + stringifyKey(key), false);

          _this3.data_.set(key, observable);

          newValue = observable.value_; // value might have been changed

          _this3.updateHasMapEntry_(key, true);

          _this3.keysAtom_.reportChanged();
        });
        var notifySpy = isSpyEnabled();
        var notify = hasListeners(this);
        var change = notify || notifySpy ? {
          observableKind: "map",
          debugObjectName: this.name_,
          type: ADD,
          object: this,
          name: key,
          newValue: newValue
        } : null;
        if ( notifySpy) spyReportStart(change);
        if (notify) notifyListeners(this, change);
        if ( notifySpy) spyReportEnd();
      };

      _proto.get = function get(key) {
        if (this.has(key)) return this.dehanceValue_(this.data_.get(key).get());
        return this.dehanceValue_(undefined);
      };

      _proto.dehanceValue_ = function dehanceValue_(value) {
        if (this.dehancer !== undefined) {
          return this.dehancer(value);
        }

        return value;
      };

      _proto.keys = function keys() {
        this.keysAtom_.reportObserved();
        return this.data_.keys();
      };

      _proto.values = function values() {
        var self = this;
        var keys = this.keys();
        return makeIterable({
          next: function next() {
            var _keys$next = keys.next(),
                done = _keys$next.done,
                value = _keys$next.value;

            return {
              done: done,
              value: done ? undefined : self.get(value)
            };
          }
        });
      };

      _proto.entries = function entries() {
        var self = this;
        var keys = this.keys();
        return makeIterable({
          next: function next() {
            var _keys$next2 = keys.next(),
                done = _keys$next2.done,
                value = _keys$next2.value;

            return {
              done: done,
              value: done ? undefined : [value, self.get(value)]
            };
          }
        });
      };

      _proto[_Symbol$iterator] = function () {
        return this.entries();
      };

      _proto.forEach = function forEach(callback, thisArg) {
        for (var _iterator = _createForOfIteratorHelperLoose(this), _step; !(_step = _iterator()).done;) {
          var _step$value = _step.value,
              key = _step$value[0],
              value = _step$value[1];
          callback.call(thisArg, value, key, this);
        }
      }
      /** Merge another object into this object, returns this. */
      ;

      _proto.merge = function merge(other) {
        var _this4 = this;

        if (isObservableMap(other)) {
          other = new Map(other);
        }

        transaction(function () {
          if (isPlainObject(other)) getPlainObjectKeys(other).forEach(function (key) {
            return _this4.set(key, other[key]);
          });else if (Array.isArray(other)) other.forEach(function (_ref) {
            var key = _ref[0],
                value = _ref[1];
            return _this4.set(key, value);
          });else if (isES6Map(other)) {
            if (other.constructor !== Map) die(19, other);
            other.forEach(function (value, key) {
              return _this4.set(key, value);
            });
          } else if (other !== null && other !== undefined) die(20, other);
        });
        return this;
      };

      _proto.clear = function clear() {
        var _this5 = this;

        transaction(function () {
          untracked(function () {
            for (var _iterator2 = _createForOfIteratorHelperLoose(_this5.keys()), _step2; !(_step2 = _iterator2()).done;) {
              var key = _step2.value;

              _this5["delete"](key);
            }
          });
        });
      };

      _proto.replace = function replace(values) {
        var _this6 = this;

        // Implementation requirements:
        // - respect ordering of replacement map
        // - allow interceptors to run and potentially prevent individual operations
        // - don't recreate observables that already exist in original map (so we don't destroy existing subscriptions)
        // - don't _keysAtom.reportChanged if the keys of resulting map are indentical (order matters!)
        // - note that result map may differ from replacement map due to the interceptors
        transaction(function () {
          // Convert to map so we can do quick key lookups
          var replacementMap = convertToMap(values);
          var orderedData = new Map(); // Used for optimization

          var keysReportChangedCalled = false; // Delete keys that don't exist in replacement map
          // if the key deletion is prevented by interceptor
          // add entry at the beginning of the result map

          for (var _iterator3 = _createForOfIteratorHelperLoose(_this6.data_.keys()), _step3; !(_step3 = _iterator3()).done;) {
            var key = _step3.value;

            // Concurrently iterating/deleting keys
            // iterator should handle this correctly
            if (!replacementMap.has(key)) {
              var deleted = _this6["delete"](key); // Was the key removed?


              if (deleted) {
                // _keysAtom.reportChanged() was already called
                keysReportChangedCalled = true;
              } else {
                // Delete prevented by interceptor
                var value = _this6.data_.get(key);

                orderedData.set(key, value);
              }
            }
          } // Merge entries


          for (var _iterator4 = _createForOfIteratorHelperLoose(replacementMap.entries()), _step4; !(_step4 = _iterator4()).done;) {
            var _step4$value = _step4.value,
                _key = _step4$value[0],
                _value = _step4$value[1];

            // We will want to know whether a new key is added
            var keyExisted = _this6.data_.has(_key); // Add or update value


            _this6.set(_key, _value); // The addition could have been prevent by interceptor


            if (_this6.data_.has(_key)) {
              // The update could have been prevented by interceptor
              // and also we want to preserve existing values
              // so use value from _data map (instead of replacement map)
              var _value2 = _this6.data_.get(_key);

              orderedData.set(_key, _value2); // Was a new key added?

              if (!keyExisted) {
                // _keysAtom.reportChanged() was already called
                keysReportChangedCalled = true;
              }
            }
          } // Check for possible key order change


          if (!keysReportChangedCalled) {
            if (_this6.data_.size !== orderedData.size) {
              // If size differs, keys are definitely modified
              _this6.keysAtom_.reportChanged();
            } else {
              var iter1 = _this6.data_.keys();

              var iter2 = orderedData.keys();
              var next1 = iter1.next();
              var next2 = iter2.next();

              while (!next1.done) {
                if (next1.value !== next2.value) {
                  _this6.keysAtom_.reportChanged();

                  break;
                }

                next1 = iter1.next();
                next2 = iter2.next();
              }
            }
          } // Use correctly ordered map


          _this6.data_ = orderedData;
        });
        return this;
      };

      _proto.toString = function toString() {
        return "[object ObservableMap]";
      };

      _proto.toJSON = function toJSON() {
        return Array.from(this);
      };

      /**
       * Observes this object. Triggers for the events 'add', 'update' and 'delete'.
       * See: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/observe
       * for callback details
       */
      _proto.observe_ = function observe_(listener, fireImmediately) {
        if ( fireImmediately === true) die("`observe` doesn't support fireImmediately=true in combination with maps.");
        return registerListener(this, listener);
      };

      _proto.intercept_ = function intercept_(handler) {
        return registerInterceptor(this, handler);
      };

      _createClass(ObservableMap, [{
        key: "size",
        get: function get() {
          this.keysAtom_.reportObserved();
          return this.data_.size;
        }
      }, {
        key: _Symbol$toStringTag,
        get: function get() {
          return "Map";
        }
      }]);

      return ObservableMap;
    }(); // eslint-disable-next-line

    var isObservableMap = /*#__PURE__*/createInstanceofPredicate("ObservableMap", ObservableMap);

    function convertToMap(dataStructure) {
      if (isES6Map(dataStructure) || isObservableMap(dataStructure)) {
        return dataStructure;
      } else if (Array.isArray(dataStructure)) {
        return new Map(dataStructure);
      } else if (isPlainObject(dataStructure)) {
        var map = new Map();

        for (var key in dataStructure) {
          map.set(key, dataStructure[key]);
        }

        return map;
      } else {
        return die(21, dataStructure);
      }
    }

    var _Symbol$iterator$1, _Symbol$toStringTag$1;
    var ObservableSetMarker = {};
    _Symbol$iterator$1 = Symbol.iterator;
    _Symbol$toStringTag$1 = Symbol.toStringTag;
    var ObservableSet = /*#__PURE__*/function () {
      function ObservableSet(initialData, enhancer, name_) {
        if (enhancer === void 0) {
          enhancer = deepEnhancer;
        }

        if (name_ === void 0) {
          name_ = "ObservableSet@" + getNextId();
        }

        this.name_ = void 0;
        this[$mobx] = ObservableSetMarker;
        this.data_ = new Set();
        this.atom_ = void 0;
        this.changeListeners_ = void 0;
        this.interceptors_ = void 0;
        this.dehancer = void 0;
        this.enhancer_ = void 0;
        this.name_ = name_;

        if (!isFunction(Set)) {
          die(22);
        }

        this.atom_ = createAtom(this.name_);

        this.enhancer_ = function (newV, oldV) {
          return enhancer(newV, oldV, name_);
        };

        if (initialData) {
          this.replace(initialData);
        }
      }

      var _proto = ObservableSet.prototype;

      _proto.dehanceValue_ = function dehanceValue_(value) {
        if (this.dehancer !== undefined) {
          return this.dehancer(value);
        }

        return value;
      };

      _proto.clear = function clear() {
        var _this = this;

        transaction(function () {
          untracked(function () {
            for (var _iterator = _createForOfIteratorHelperLoose(_this.data_.values()), _step; !(_step = _iterator()).done;) {
              var value = _step.value;

              _this["delete"](value);
            }
          });
        });
      };

      _proto.forEach = function forEach(callbackFn, thisArg) {
        for (var _iterator2 = _createForOfIteratorHelperLoose(this), _step2; !(_step2 = _iterator2()).done;) {
          var value = _step2.value;
          callbackFn.call(thisArg, value, value, this);
        }
      };

      _proto.add = function add(value) {
        var _this2 = this;

        checkIfStateModificationsAreAllowed(this.atom_);

        if (hasInterceptors(this)) {
          var change = interceptChange(this, {
            type: ADD,
            object: this,
            newValue: value
          });
          if (!change) return this; // ideally, value = change.value would be done here, so that values can be
          // changed by interceptor. Same applies for other Set and Map api's.
        }

        if (!this.has(value)) {
          transaction(function () {
            _this2.data_.add(_this2.enhancer_(value, undefined));

            _this2.atom_.reportChanged();
          });
          var notifySpy =  isSpyEnabled();
          var notify = hasListeners(this);

          var _change = notify || notifySpy ? {
            observableKind: "set",
            debugObjectName: this.name_,
            type: ADD,
            object: this,
            newValue: value
          } : null;

          if (notifySpy && "development" !== "production") spyReportStart(_change);
          if (notify) notifyListeners(this, _change);
          if (notifySpy && "development" !== "production") spyReportEnd();
        }

        return this;
      };

      _proto["delete"] = function _delete(value) {
        var _this3 = this;

        if (hasInterceptors(this)) {
          var change = interceptChange(this, {
            type: DELETE,
            object: this,
            oldValue: value
          });
          if (!change) return false;
        }

        if (this.has(value)) {
          var notifySpy =  isSpyEnabled();
          var notify = hasListeners(this);

          var _change2 = notify || notifySpy ? {
            observableKind: "set",
            debugObjectName: this.name_,
            type: DELETE,
            object: this,
            oldValue: value
          } : null;

          if (notifySpy && "development" !== "production") spyReportStart(_change2);
          transaction(function () {
            _this3.atom_.reportChanged();

            _this3.data_["delete"](value);
          });
          if (notify) notifyListeners(this, _change2);
          if (notifySpy && "development" !== "production") spyReportEnd();
          return true;
        }

        return false;
      };

      _proto.has = function has(value) {
        this.atom_.reportObserved();
        return this.data_.has(this.dehanceValue_(value));
      };

      _proto.entries = function entries() {
        var nextIndex = 0;
        var keys = Array.from(this.keys());
        var values = Array.from(this.values());
        return makeIterable({
          next: function next() {
            var index = nextIndex;
            nextIndex += 1;
            return index < values.length ? {
              value: [keys[index], values[index]],
              done: false
            } : {
              done: true
            };
          }
        });
      };

      _proto.keys = function keys() {
        return this.values();
      };

      _proto.values = function values() {
        this.atom_.reportObserved();
        var self = this;
        var nextIndex = 0;
        var observableValues = Array.from(this.data_.values());
        return makeIterable({
          next: function next() {
            return nextIndex < observableValues.length ? {
              value: self.dehanceValue_(observableValues[nextIndex++]),
              done: false
            } : {
              done: true
            };
          }
        });
      };

      _proto.replace = function replace(other) {
        var _this4 = this;

        if (isObservableSet(other)) {
          other = new Set(other);
        }

        transaction(function () {
          if (Array.isArray(other)) {
            _this4.clear();

            other.forEach(function (value) {
              return _this4.add(value);
            });
          } else if (isES6Set(other)) {
            _this4.clear();

            other.forEach(function (value) {
              return _this4.add(value);
            });
          } else if (other !== null && other !== undefined) {
            die("Cannot initialize set from " + other);
          }
        });
        return this;
      };

      _proto.observe_ = function observe_(listener, fireImmediately) {
        // ... 'fireImmediately' could also be true?
        if ( fireImmediately === true) die("`observe` doesn't support fireImmediately=true in combination with sets.");
        return registerListener(this, listener);
      };

      _proto.intercept_ = function intercept_(handler) {
        return registerInterceptor(this, handler);
      };

      _proto.toJSON = function toJSON() {
        return Array.from(this);
      };

      _proto.toString = function toString() {
        return "[object ObservableSet]";
      };

      _proto[_Symbol$iterator$1] = function () {
        return this.values();
      };

      _createClass(ObservableSet, [{
        key: "size",
        get: function get() {
          this.atom_.reportObserved();
          return this.data_.size;
        }
      }, {
        key: _Symbol$toStringTag$1,
        get: function get() {
          return "Set";
        }
      }]);

      return ObservableSet;
    }(); // eslint-disable-next-line

    var isObservableSet = /*#__PURE__*/createInstanceofPredicate("ObservableSet", ObservableSet);

    var inferredAnnotationsSymbol = /*#__PURE__*/Symbol("mobx-inferred-annotations");
    var descriptorCache = /*#__PURE__*/Object.create(null);
    var REMOVE = "remove";
    var ObservableObjectAdministration = /*#__PURE__*/function () {
      function ObservableObjectAdministration(target_, values_, name_, // Used anytime annotation is not explicitely provided
      defaultAnnotation_, // Bind automatically inferred actions?
      autoBind_) {
        if (values_ === void 0) {
          values_ = new Map();
        }

        if (defaultAnnotation_ === void 0) {
          defaultAnnotation_ = observable;
        }

        if (autoBind_ === void 0) {
          autoBind_ = false;
        }

        this.target_ = void 0;
        this.values_ = void 0;
        this.name_ = void 0;
        this.defaultAnnotation_ = void 0;
        this.autoBind_ = void 0;
        this.keysAtom_ = void 0;
        this.changeListeners_ = void 0;
        this.interceptors_ = void 0;
        this.proxy_ = void 0;
        this.isPlainObject_ = void 0;
        this.appliedAnnotations_ = void 0;
        this.pendingKeys_ = void 0;
        this.target_ = target_;
        this.values_ = values_;
        this.name_ = name_;
        this.defaultAnnotation_ = defaultAnnotation_;
        this.autoBind_ = autoBind_;
        this.keysAtom_ = new Atom(name_ + ".keys"); // Optimization: we use this frequently

        this.isPlainObject_ = isPlainObject(this.target_);

        if ( !isAnnotation(this.defaultAnnotation_)) {
          die("defaultAnnotation must be valid annotation");
        }

        if ( typeof this.autoBind_ !== "boolean") {
          die("autoBind must be boolean");
        }

        {
          // Prepare structure for tracking which fields were already annotated
          this.appliedAnnotations_ = {};
        }
      }

      var _proto = ObservableObjectAdministration.prototype;

      _proto.getObservablePropValue_ = function getObservablePropValue_(key) {
        return this.values_.get(key).get();
      };

      _proto.setObservablePropValue_ = function setObservablePropValue_(key, newValue) {
        var observable = this.values_.get(key);

        if (observable instanceof ComputedValue) {
          observable.set(newValue);
          return true;
        } // intercept


        if (hasInterceptors(this)) {
          var change = interceptChange(this, {
            type: UPDATE,
            object: this.proxy_ || this.target_,
            name: key,
            newValue: newValue
          });
          if (!change) return null;
          newValue = change.newValue;
        }

        newValue = observable.prepareNewValue_(newValue); // notify spy & observers

        if (newValue !== globalState.UNCHANGED) {
          var notify = hasListeners(this);
          var notifySpy =  isSpyEnabled();

          var _change = notify || notifySpy ? {
            type: UPDATE,
            observableKind: "object",
            debugObjectName: this.name_,
            object: this.proxy_ || this.target_,
            oldValue: observable.value_,
            name: key,
            newValue: newValue
          } : null;

          if ( notifySpy) spyReportStart(_change);
          observable.setNewValue_(newValue);
          if (notify) notifyListeners(this, _change);
          if ( notifySpy) spyReportEnd();
        }

        return true;
      };

      _proto.get_ = function get_(key) {
        if (globalState.trackingDerivation && !hasProp(this.target_, key)) {
          // Key doesn't exist yet, subscribe for it in case it's added later
          this.has_(key);
        }

        return this.target_[key];
      }
      /**
       * @param {PropertyKey} key
       * @param {any} value
       * @param {Annotation|boolean} annotation true - infer from descriptor, false - copy as is
       * @param {boolean} proxyTrap whether it's called from proxy trap
       * @returns {boolean|null} true on success, false on failure (proxyTrap + non-configurable), null when cancelled by interceptor
       */
      ;

      _proto.set_ = function set_(key, value, proxyTrap) {
        if (proxyTrap === void 0) {
          proxyTrap = false;
        }

        // Don't use .has(key) - we care about own
        if (hasProp(this.target_, key)) {
          // Existing prop
          if (this.values_.has(key)) {
            // Observable (can be intercepted)
            return this.setObservablePropValue_(key, value);
          } else if (proxyTrap) {
            // Non-observable - proxy
            return Reflect.set(this.target_, key, value);
          } else {
            // Non-observable
            this.target_[key] = value;
            return true;
          }
        } else {
          // New prop
          return this.extend_(key, {
            value: value,
            enumerable: true,
            writable: true,
            configurable: true
          }, this.defaultAnnotation_, proxyTrap);
        }
      } // Trap for "in"
      ;

      _proto.has_ = function has_(key) {
        if (!globalState.trackingDerivation) {
          // Skip key subscription outside derivation
          return key in this.target_;
        }

        this.pendingKeys_ || (this.pendingKeys_ = new Map());
        var entry = this.pendingKeys_.get(key);

        if (!entry) {
          entry = new ObservableValue(key in this.target_, referenceEnhancer, this.name_ + "." + stringifyKey(key) + "?", false);
          this.pendingKeys_.set(key, entry);
        }

        return entry.get();
      }
      /**
       * @param {PropertyKey} key
       * @param {Annotation|boolean} annotation true - infer from object or it's prototype, false - ignore
       */
      ;

      _proto.make_ = function make_(key, annotation) {
        if (annotation === true) {
          annotation = this.inferAnnotation_(key);
        }

        if (annotation === false) {
          return;
        }

        assertAnnotable(this, annotation, key);
        annotation.make_(this, key);
      }
      /**
       * @param {PropertyKey} key
       * @param {PropertyDescriptor} descriptor
       * @param {Annotation|boolean} annotation true - infer from descriptor, false - copy as is
       * @param {boolean} proxyTrap whether it's called from proxy trap
       * @returns {boolean|null} true on success, false on failure (proxyTrap + non-configurable), null when cancelled by interceptor
       */
      ;

      _proto.extend_ = function extend_(key, descriptor, annotation, proxyTrap) {
        if (proxyTrap === void 0) {
          proxyTrap = false;
        }

        if (annotation === true) {
          annotation = inferAnnotationFromDescriptor(descriptor, this.defaultAnnotation_, this.autoBind_);
        }

        if (annotation === false) {
          return this.defineProperty_(key, descriptor, proxyTrap);
        }

        assertAnnotable(this, annotation, key);
        var outcome = annotation.extend_(this, key, descriptor, proxyTrap);

        if (outcome) {
          recordAnnotationApplied(this, annotation, key);
        }

        return outcome;
      };

      _proto.inferAnnotation_ = function inferAnnotation_(key) {
        var _this$target_$inferre;

        // Inherited is fine - annotation cannot differ in subclass
        var annotation = (_this$target_$inferre = this.target_[inferredAnnotationsSymbol]) == null ? void 0 : _this$target_$inferre[key];
        if (annotation) return annotation;
        var current = this.target_;

        while (current && current !== objectPrototype) {
          var descriptor = getDescriptor(current, key);

          if (descriptor) {
            annotation = inferAnnotationFromDescriptor(descriptor, this.defaultAnnotation_, this.autoBind_);
            break;
          }

          current = Object.getPrototypeOf(current);
        } // Not found (false means ignore)


        if (annotation === undefined) {
          die(1, "true", key);
        } // Cache the annotation.
        // Note we can do this only because annotation and field can't change.


        if (!this.isPlainObject_) {
          // We could also place it on furthest proto, shoudn't matter
          var closestProto = Object.getPrototypeOf(this.target_);

          if (!hasProp(closestProto, inferredAnnotationsSymbol)) {
            addHiddenProp(closestProto, inferredAnnotationsSymbol, {});
          }

          closestProto[inferredAnnotationsSymbol][key] = annotation;
        }

        return annotation;
      }
      /**
       * @param {PropertyKey} key
       * @param {PropertyDescriptor} descriptor
       * @param {boolean} proxyTrap whether it's called from proxy trap
       * @returns {boolean|null} true on success, false on failure (proxyTrap + non-configurable), null when cancelled by interceptor
       */
      ;

      _proto.defineProperty_ = function defineProperty_(key, descriptor, proxyTrap) {
        if (proxyTrap === void 0) {
          proxyTrap = false;
        }

        try {
          startBatch(); // Delete

          var deleteOutcome = this.delete_(key);

          if (!deleteOutcome) {
            // Failure or intercepted
            return deleteOutcome;
          } // ADD interceptor


          if (hasInterceptors(this)) {
            var change = interceptChange(this, {
              object: this.proxy_ || this.target_,
              name: key,
              type: ADD,
              newValue: descriptor.value
            });
            if (!change) return null;
            var newValue = change.newValue;

            if (descriptor.value !== newValue) {
              descriptor = _extends({}, descriptor, {
                value: newValue
              });
            }
          } // Define


          if (proxyTrap) {
            if (!Reflect.defineProperty(this.target_, key, descriptor)) {
              return false;
            }
          } else {
            defineProperty(this.target_, key, descriptor);
          } // Notify


          this.notifyPropertyAddition_(key, descriptor.value);
        } finally {
          endBatch();
        }

        return true;
      } // If original descriptor becomes relevant, move this to annotation directly
      ;

      _proto.defineObservableProperty_ = function defineObservableProperty_(key, value, enhancer, proxyTrap) {
        if (proxyTrap === void 0) {
          proxyTrap = false;
        }

        try {
          startBatch(); // Delete

          var deleteOutcome = this.delete_(key);

          if (!deleteOutcome) {
            // Failure or intercepted
            return deleteOutcome;
          } // ADD interceptor


          if (hasInterceptors(this)) {
            var change = interceptChange(this, {
              object: this.proxy_ || this.target_,
              name: key,
              type: ADD,
              newValue: value
            });
            if (!change) return null;
            value = change.newValue;
          }

          var cachedDescriptor = getCachedObservablePropDescriptor(key);
          var descriptor = {
            configurable: globalState.safeDescriptors ? this.isPlainObject_ : true,
            enumerable: true,
            get: cachedDescriptor.get,
            set: cachedDescriptor.set
          }; // Define

          if (proxyTrap) {
            if (!Reflect.defineProperty(this.target_, key, descriptor)) {
              return false;
            }
          } else {
            defineProperty(this.target_, key, descriptor);
          }

          var _observable = new ObservableValue(value, enhancer, this.name_ + "." + stringifyKey(key), false);

          this.values_.set(key, _observable); // Notify (value possibly changed by ObservableValue)

          this.notifyPropertyAddition_(key, _observable.value_);
        } finally {
          endBatch();
        }

        return true;
      } // If original descriptor becomes relevant, move this to annotation directly
      ;

      _proto.defineComputedProperty_ = function defineComputedProperty_(key, options, proxyTrap) {
        if (proxyTrap === void 0) {
          proxyTrap = false;
        }

        try {
          startBatch(); // Delete

          var deleteOutcome = this.delete_(key);

          if (!deleteOutcome) {
            // Failure or intercepted
            return deleteOutcome;
          } // ADD interceptor


          if (hasInterceptors(this)) {
            var change = interceptChange(this, {
              object: this.proxy_ || this.target_,
              name: key,
              type: ADD,
              newValue: undefined
            });
            if (!change) return null;
          }

          options.name || (options.name = this.name_ + "." + stringifyKey(key));
          options.context = this.proxy_ || this.target_;
          var cachedDescriptor = getCachedObservablePropDescriptor(key);
          var descriptor = {
            configurable: globalState.safeDescriptors ? this.isPlainObject_ : true,
            enumerable: false,
            get: cachedDescriptor.get,
            set: cachedDescriptor.set
          }; // Define

          if (proxyTrap) {
            if (!Reflect.defineProperty(this.target_, key, descriptor)) {
              return false;
            }
          } else {
            defineProperty(this.target_, key, descriptor);
          }

          this.values_.set(key, new ComputedValue(options)); // Notify

          this.notifyPropertyAddition_(key, undefined);
        } finally {
          endBatch();
        }

        return true;
      }
      /**
       * @param {PropertyKey} key
       * @param {PropertyDescriptor} descriptor
       * @param {boolean} proxyTrap whether it's called from proxy trap
       * @returns {boolean|null} true on success, false on failure (proxyTrap + non-configurable), null when cancelled by interceptor
       */
      ;

      _proto.delete_ = function delete_(key, proxyTrap) {
        if (proxyTrap === void 0) {
          proxyTrap = false;
        }

        // No such prop
        if (!hasProp(this.target_, key)) {
          return true;
        } // Intercept


        if (hasInterceptors(this)) {
          var change = interceptChange(this, {
            object: this.proxy_ || this.target_,
            name: key,
            type: REMOVE
          }); // Cancelled

          if (!change) return null;
        } // Delete


        try {
          var _this$pendingKeys_, _this$pendingKeys_$ge;

          startBatch();
          var notify = hasListeners(this);
          var notifySpy = "development" !== "production" && isSpyEnabled();

          var _observable2 = this.values_.get(key); // Value needed for spies/listeners


          var value = undefined; // Optimization: don't pull the value unless we will need it

          if (!_observable2 && (notify || notifySpy)) {
            var _getDescriptor;

            value = (_getDescriptor = getDescriptor(this.target_, key)) == null ? void 0 : _getDescriptor.value;
          } // delete prop (do first, may fail)


          if (proxyTrap) {
            if (!Reflect.deleteProperty(this.target_, key)) {
              return false;
            }
          } else {
            delete this.target_[key];
          } // Allow re-annotating this field


          if ("development" !== "production") {
            delete this.appliedAnnotations_[key];
          } // Clear observable


          if (_observable2) {
            this.values_["delete"](key); // for computed, value is undefined

            if (_observable2 instanceof ObservableValue) {
              value = _observable2.value_;
            } // Notify: autorun(() => obj[key]), see #1796


            propagateChanged(_observable2);
          } // Notify "keys/entries/values" observers


          this.keysAtom_.reportChanged(); // Notify "has" observers
          // "in" as it may still exist in proto

          (_this$pendingKeys_ = this.pendingKeys_) == null ? void 0 : (_this$pendingKeys_$ge = _this$pendingKeys_.get(key)) == null ? void 0 : _this$pendingKeys_$ge.set(key in this.target_); // Notify spies/listeners

          if (notify || notifySpy) {
            var _change2 = {
              type: REMOVE,
              observableKind: "object",
              object: this.proxy_ || this.target_,
              debugObjectName: this.name_,
              oldValue: value,
              name: key
            };
            if ("development" !== "production" && notifySpy) spyReportStart(_change2);
            if (notify) notifyListeners(this, _change2);
            if ("development" !== "production" && notifySpy) spyReportEnd();
          }
        } finally {
          endBatch();
        }

        return true;
      }
      /**
       * Observes this object. Triggers for the events 'add', 'update' and 'delete'.
       * See: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/observe
       * for callback details
       */
      ;

      _proto.observe_ = function observe_(callback, fireImmediately) {
        if ( fireImmediately === true) die("`observe` doesn't support the fire immediately property for observable objects.");
        return registerListener(this, callback);
      };

      _proto.intercept_ = function intercept_(handler) {
        return registerInterceptor(this, handler);
      };

      _proto.notifyPropertyAddition_ = function notifyPropertyAddition_(key, value) {
        var _this$pendingKeys_2, _this$pendingKeys_2$g;

        var notify = hasListeners(this);
        var notifySpy =  isSpyEnabled();

        if (notify || notifySpy) {
          var change = notify || notifySpy ? {
            type: ADD,
            observableKind: "object",
            debugObjectName: this.name_,
            object: this.proxy_ || this.target_,
            name: key,
            newValue: value
          } : null;
          if ( notifySpy) spyReportStart(change);
          if (notify) notifyListeners(this, change);
          if ( notifySpy) spyReportEnd();
        }

        (_this$pendingKeys_2 = this.pendingKeys_) == null ? void 0 : (_this$pendingKeys_2$g = _this$pendingKeys_2.get(key)) == null ? void 0 : _this$pendingKeys_2$g.set(true); // Notify "keys/entries/values" observers

        this.keysAtom_.reportChanged();
      };

      _proto.ownKeys_ = function ownKeys_() {
        this.keysAtom_.reportObserved();
        return ownKeys(this.target_);
      };

      _proto.keys_ = function keys_() {
        // Returns enumerable && own, but unfortunately keysAtom will report on ANY key change.
        // There is no way to distinguish between Object.keys(object) and Reflect.ownKeys(object) - both are handled by ownKeys trap.
        // We can either over-report in Object.keys(object) or under-report in Reflect.ownKeys(object)
        // We choose to over-report in Object.keys(object), because:
        // - typically it's used with simple data objects
        // - when symbolic/non-enumerable keys are relevant Reflect.ownKeys works as expected
        this.keysAtom_.reportObserved();
        return Object.keys(this.target_);
      };

      return ObservableObjectAdministration;
    }();
    function asObservableObject(target, options) {
      var _options$name;

      if ( options && isObservableObject(target)) {
        die("Options can't be provided for already observable objects.");
      }

      if (hasProp(target, $mobx)) return target;
      if ( !Object.isExtensible(target)) die("Cannot make the designated object observable; it is not extensible");
      var name = (_options$name = options == null ? void 0 : options.name) != null ? _options$name : (isPlainObject(target) ? "ObservableObject" : target.constructor.name) + "@" + getNextId();
      var adm = new ObservableObjectAdministration(target, new Map(), stringifyKey(name), getAnnotationFromOptions(options), options == null ? void 0 : options.autoBind);
      addHiddenProp(target, $mobx, adm);
      return target;
    }
    var isObservableObjectAdministration = /*#__PURE__*/createInstanceofPredicate("ObservableObjectAdministration", ObservableObjectAdministration);

    function getCachedObservablePropDescriptor(key) {
      return descriptorCache[key] || (descriptorCache[key] = {
        get: function get() {
          return this[$mobx].getObservablePropValue_(key);
        },
        set: function set(value) {
          return this[$mobx].setObservablePropValue_(key, value);
        }
      });
    }

    function isObservableObject(thing) {
      if (isObject(thing)) {
        return isObservableObjectAdministration(thing[$mobx]);
      }

      return false;
    }
    function recordAnnotationApplied(adm, annotation, key) {
      {
        adm.appliedAnnotations_[key] = annotation;
      } // Remove applied decorator annotation so we don't try to apply it again in subclass constructor


      if (annotation.isDecorator_) {
        delete adm.target_[storedAnnotationsSymbol][key];
      }
    }

    function assertAnnotable(adm, annotation, key) {
      // Valid annotation
      if ( !isAnnotation(annotation)) {
        die("Cannot annotate '" + adm.name_ + "." + key.toString() + "': Invalid annotation.");
      }
      /*
      // Configurable, not sealed, not frozen
      // Possibly not needed, just a little better error then the one thrown by engine.
      // Cases where this would be useful the most (subclass field initializer) are not interceptable by this.
      if (__DEV__) {
          const configurable = getDescriptor(adm.target_, key)?.configurable
          const frozen = Object.isFrozen(adm.target_)
          const sealed = Object.isSealed(adm.target_)
          if (!configurable || frozen || sealed) {
              const fieldName = `${adm.name_}.${key.toString()}`
              const requestedAnnotationType = annotation.annotationType_
              let error = `Cannot apply '${requestedAnnotationType}' to '${fieldName}':`
              if (frozen) {
                  error += `\nObject is frozen.`
              }
              if (sealed) {
                  error += `\nObject is sealed.`
              }
              if (!configurable) {
                  error += `\nproperty is not configurable.`
                  // Mention only if caused by us to avoid confusion
                  if (hasProp(adm.appliedAnnotations!, key)) {
                      error += `\nTo prevent accidental re-definition of a field by a subclass, `
                      error += `all annotated fields of non-plain objects (classes) are not configurable.`
                  }
              }
              die(error)
          }
      }
      */
      // Not annotated


      if ( !isOverride(annotation) && hasProp(adm.appliedAnnotations_, key)) {
        var fieldName = adm.name_ + "." + key.toString();
        var currentAnnotationType = adm.appliedAnnotations_[key].annotationType_;
        var requestedAnnotationType = annotation.annotationType_;
        die("Cannot apply '" + requestedAnnotationType + "' to '" + fieldName + "':" + ("\nThe field is already annotated with '" + currentAnnotationType + "'.") + "\nRe-annotating fields is not allowed." + "\nUse 'override' annotation for methods overriden by subclass.");
      }
    }

    /**
     * This array buffer contains two lists of properties, so that all arrays
     * can recycle their property definitions, which significantly improves performance of creating
     * properties on the fly.
     */

    var OBSERVABLE_ARRAY_BUFFER_SIZE = 0; // Typescript workaround to make sure ObservableArray extends Array

    var StubArray = function StubArray() {};

    function inherit(ctor, proto) {
      if (Object.setPrototypeOf) {
        Object.setPrototypeOf(ctor.prototype, proto);
      } else if (ctor.prototype.__proto__ !== undefined) {
        ctor.prototype.__proto__ = proto;
      } else {
        ctor.prototype = proto;
      }
    }

    inherit(StubArray, Array.prototype); // Weex proto freeze protection was here,
    // but it is unclear why the hack is need as MobX never changed the prototype
    // anyway, so removed it in V6

    var LegacyObservableArray = /*#__PURE__*/function (_StubArray) {
      _inheritsLoose(LegacyObservableArray, _StubArray);

      function LegacyObservableArray(initialValues, enhancer, name, owned) {
        var _this;

        if (name === void 0) {
          name = "ObservableArray@" + getNextId();
        }

        if (owned === void 0) {
          owned = false;
        }

        _this = _StubArray.call(this) || this;
        var adm = new ObservableArrayAdministration(name, enhancer, owned, true);
        adm.proxy_ = _assertThisInitialized(_this);
        addHiddenFinalProp(_assertThisInitialized(_this), $mobx, adm);

        if (initialValues && initialValues.length) {
          var prev = allowStateChangesStart(true); // @ts-ignore

          _this.spliceWithArray(0, 0, initialValues);

          allowStateChangesEnd(prev);
        }

        return _this;
      }

      var _proto = LegacyObservableArray.prototype;

      _proto.concat = function concat() {
        this[$mobx].atom_.reportObserved();

        for (var _len = arguments.length, arrays = new Array(_len), _key = 0; _key < _len; _key++) {
          arrays[_key] = arguments[_key];
        }

        return Array.prototype.concat.apply(this.slice(), //@ts-ignore
        arrays.map(function (a) {
          return isObservableArray(a) ? a.slice() : a;
        }));
      };

      _proto[Symbol.iterator] = function () {
        var self = this;
        var nextIndex = 0;
        return makeIterable({
          next: function next() {
            // @ts-ignore
            return nextIndex < self.length ? {
              value: self[nextIndex++],
              done: false
            } : {
              done: true,
              value: undefined
            };
          }
        });
      };

      _createClass(LegacyObservableArray, [{
        key: "length",
        get: function get() {
          return this[$mobx].getArrayLength_();
        },
        set: function set(newLength) {
          this[$mobx].setArrayLength_(newLength);
        }
      }, {
        key: Symbol.toStringTag,
        get: function get() {
          return "Array";
        }
      }]);

      return LegacyObservableArray;
    }(StubArray);

    Object.entries(arrayExtensions).forEach(function (_ref) {
      var prop = _ref[0],
          fn = _ref[1];
      if (prop !== "concat") addHiddenProp(LegacyObservableArray.prototype, prop, fn);
    });

    function createArrayEntryDescriptor(index) {
      return {
        enumerable: false,
        configurable: true,
        get: function get() {
          return this[$mobx].get_(index);
        },
        set: function set(value) {
          this[$mobx].set_(index, value);
        }
      };
    }

    function createArrayBufferItem(index) {
      defineProperty(LegacyObservableArray.prototype, "" + index, createArrayEntryDescriptor(index));
    }

    function reserveArrayBuffer(max) {
      if (max > OBSERVABLE_ARRAY_BUFFER_SIZE) {
        for (var index = OBSERVABLE_ARRAY_BUFFER_SIZE; index < max + 100; index++) {
          createArrayBufferItem(index);
        }

        OBSERVABLE_ARRAY_BUFFER_SIZE = max;
      }
    }
    reserveArrayBuffer(1000);
    function createLegacyArray(initialValues, enhancer, name) {
      return new LegacyObservableArray(initialValues, enhancer, name);
    }

    function getAtom(thing, property) {
      if (typeof thing === "object" && thing !== null) {
        if (isObservableArray(thing)) {
          if (property !== undefined) die(23);
          return thing[$mobx].atom_;
        }

        if (isObservableSet(thing)) {
          return thing[$mobx];
        }

        if (isObservableMap(thing)) {
          if (property === undefined) return thing.keysAtom_;
          var observable = thing.data_.get(property) || thing.hasMap_.get(property);
          if (!observable) die(25, property, getDebugName(thing));
          return observable;
        }

        if (isObservableObject(thing)) {
          if (!property) return die(26);

          var _observable = thing[$mobx].values_.get(property);

          if (!_observable) die(27, property, getDebugName(thing));
          return _observable;
        }

        if (isAtom(thing) || isComputedValue(thing) || isReaction(thing)) {
          return thing;
        }
      } else if (isFunction(thing)) {
        if (isReaction(thing[$mobx])) {
          // disposer function
          return thing[$mobx];
        }
      }

      die(28);
    }
    function getAdministration(thing, property) {
      if (!thing) die(29);
      if (property !== undefined) return getAdministration(getAtom(thing, property));
      if (isAtom(thing) || isComputedValue(thing) || isReaction(thing)) return thing;
      if (isObservableMap(thing) || isObservableSet(thing)) return thing;
      if (thing[$mobx]) return thing[$mobx];
      die(24, thing);
    }
    function getDebugName(thing, property) {
      var named;
      if (property !== undefined) named = getAtom(thing, property);else if (isObservableObject(thing) || isObservableMap(thing) || isObservableSet(thing)) named = getAdministration(thing);else named = getAtom(thing); // valid for arrays as well

      return named.name_;
    }

    var toString = objectPrototype.toString;
    function deepEqual(a, b, depth) {
      if (depth === void 0) {
        depth = -1;
      }

      return eq(a, b, depth);
    } // Copied from https://github.com/jashkenas/underscore/blob/5c237a7c682fb68fd5378203f0bf22dce1624854/underscore.js#L1186-L1289
    // Internal recursive comparison function for `isEqual`.

    function eq(a, b, depth, aStack, bStack) {
      // Identical objects are equal. `0 === -0`, but they aren't identical.
      // See the [Harmony `egal` proposal](http://wiki.ecmascript.org/doku.php?id=harmony:egal).
      if (a === b) return a !== 0 || 1 / a === 1 / b; // `null` or `undefined` only equal to itself (strict comparison).

      if (a == null || b == null) return false; // `NaN`s are equivalent, but non-reflexive.

      if (a !== a) return b !== b; // Exhaust primitive checks

      var type = typeof a;
      if (!isFunction(type) && type !== "object" && typeof b != "object") return false; // Compare `[[Class]]` names.

      var className = toString.call(a);
      if (className !== toString.call(b)) return false;

      switch (className) {
        // Strings, numbers, regular expressions, dates, and booleans are compared by value.
        case "[object RegExp]": // RegExps are coerced to strings for comparison (Note: '' + /a/i === '/a/i')

        case "[object String]":
          // Primitives and their corresponding object wrappers are equivalent; thus, `"5"` is
          // equivalent to `new String("5")`.
          return "" + a === "" + b;

        case "[object Number]":
          // `NaN`s are equivalent, but non-reflexive.
          // Object(NaN) is equivalent to NaN.
          if (+a !== +a) return +b !== +b; // An `egal` comparison is performed for other numeric values.

          return +a === 0 ? 1 / +a === 1 / b : +a === +b;

        case "[object Date]":
        case "[object Boolean]":
          // Coerce dates and booleans to numeric primitive values. Dates are compared by their
          // millisecond representations. Note that invalid dates with millisecond representations
          // of `NaN` are not equivalent.
          return +a === +b;

        case "[object Symbol]":
          return typeof Symbol !== "undefined" && Symbol.valueOf.call(a) === Symbol.valueOf.call(b);

        case "[object Map]":
        case "[object Set]":
          // Maps and Sets are unwrapped to arrays of entry-pairs, adding an incidental level.
          // Hide this extra level by increasing the depth.
          if (depth >= 0) {
            depth++;
          }

          break;
      } // Unwrap any wrapped objects.


      a = unwrap(a);
      b = unwrap(b);
      var areArrays = className === "[object Array]";

      if (!areArrays) {
        if (typeof a != "object" || typeof b != "object") return false; // Objects with different constructors are not equivalent, but `Object`s or `Array`s
        // from different frames are.

        var aCtor = a.constructor,
            bCtor = b.constructor;

        if (aCtor !== bCtor && !(isFunction(aCtor) && aCtor instanceof aCtor && isFunction(bCtor) && bCtor instanceof bCtor) && "constructor" in a && "constructor" in b) {
          return false;
        }
      }

      if (depth === 0) {
        return false;
      } else if (depth < 0) {
        depth = -1;
      } // Assume equality for cyclic structures. The algorithm for detecting cyclic
      // structures is adapted from ES 5.1 section 15.12.3, abstract operation `JO`.
      // Initializing stack of traversed objects.
      // It's done here since we only need them for objects and arrays comparison.


      aStack = aStack || [];
      bStack = bStack || [];
      var length = aStack.length;

      while (length--) {
        // Linear search. Performance is inversely proportional to the number of
        // unique nested structures.
        if (aStack[length] === a) return bStack[length] === b;
      } // Add the first object to the stack of traversed objects.


      aStack.push(a);
      bStack.push(b); // Recursively compare objects and arrays.

      if (areArrays) {
        // Compare array lengths to determine if a deep comparison is necessary.
        length = a.length;
        if (length !== b.length) return false; // Deep compare the contents, ignoring non-numeric properties.

        while (length--) {
          if (!eq(a[length], b[length], depth - 1, aStack, bStack)) return false;
        }
      } else {
        // Deep compare objects.
        var keys = Object.keys(a);
        var key;
        length = keys.length; // Ensure that both objects contain the same number of properties before comparing deep equality.

        if (Object.keys(b).length !== length) return false;

        while (length--) {
          // Deep compare each member
          key = keys[length];
          if (!(hasProp(b, key) && eq(a[key], b[key], depth - 1, aStack, bStack))) return false;
        }
      } // Remove the first object from the stack of traversed objects.


      aStack.pop();
      bStack.pop();
      return true;
    }

    function unwrap(a) {
      if (isObservableArray(a)) return a.slice();
      if (isES6Map(a) || isObservableMap(a)) return Array.from(a.entries());
      if (isES6Set(a) || isObservableSet(a)) return Array.from(a.entries());
      return a;
    }

    function makeIterable(iterator) {
      iterator[Symbol.iterator] = getSelf;
      return iterator;
    }

    function getSelf() {
      return this;
    }

    /**
     * Infers the best fitting annotation from property descriptor or false if the field shoudn't be annotated
     * - getter(+setter) -> computed
     * - setter w/o getter -> false (ignore)
     * - flow -> false (ignore)
     * - generator -> flow
     * - action -> false (ignore)
     * - function -> action (optionally bound)
     * - other -> defaultAnnotation
     */

    function inferAnnotationFromDescriptor(desc, defaultAnnotation, autoBind) {
      if (desc.get) return computed;
      if (desc.set) return false; // ignore lone setter
      // If already wrapped in action/flow, don't do that another time, but assume it is already set up properly.

      return isFunction(desc.value) ? isGenerator(desc.value) ? isFlow(desc.value) ? false : flow : isAction(desc.value) ? false : autoBind ? autoAction.bound : autoAction : defaultAnnotation;
    }
    function isAnnotation(thing) {
      return (// Can be function
        thing instanceof Object && typeof thing.annotationType_ === "string" && isFunction(thing.make_) && isFunction(thing.extend_)
      );
    }

    /**
     * (c) Michel Weststrate 2015 - 2020
     * MIT Licensed
     *
     * Welcome to the mobx sources! To get an global overview of how MobX internally works,
     * this is a good place to start:
     * https://medium.com/@mweststrate/becoming-fully-reactive-an-in-depth-explanation-of-mobservable-55995262a254#.xvbh6qd74
     *
     * Source folders:
     * ===============
     *
     * - api/     Most of the public static methods exposed by the module can be found here.
     * - core/    Implementation of the MobX algorithm; atoms, derivations, reactions, dependency trees, optimizations. Cool stuff can be found here.
     * - types/   All the magic that is need to have observable objects, arrays and values is in this folder. Including the modifiers like `asFlat`.
     * - utils/   Utility stuff.
     *
     */
    ["Symbol", "Map", "Set", "Symbol"].forEach(function (m) {
      var g = getGlobal();

      if (typeof g[m] === "undefined") {
        die("MobX requires global '" + m + "' to be available or polyfilled");
      }
    });

    if (typeof __MOBX_DEVTOOLS_GLOBAL_HOOK__ === "object") {
      // See: https://github.com/andykog/mobx-devtools/
      __MOBX_DEVTOOLS_GLOBAL_HOOK__.injectMobx({
        spy: spy,
        extras: {
          getDebugName: getDebugName
        },
        $mobx: $mobx
      });
    }

    /**
     * make function, which bind the viewmodel to the component
     * Wraps react component by passing prepared viewmodel into it as a separate prop
     * Should be used if vmFactory is overriden if we want to utilize IoC container for viewmodel instances creation
     * Otherwise - use default 'withVM' function
     * @param vmFactory - factory, used for creation of the viewmodel from it's constructor and initial props passed to the component
     */
    const makeWithVM = (vmFactory) => (VMConstructor, currentProps, depsSelector) => {
        let depsValues = depsSelector ? depsSelector() : {};
        let viewModel = vmFactory(currentProps(), VMConstructor);
        // todo: require support for async initialization logic, so far ignore promises returned from 'initialize' method
        viewModel.initialize && viewModel.initialize();
        setContext(VMConstructor.name, viewModel);
        afterUpdate(() => {
            let newDepsValues = depsSelector ? depsSelector() : {};
            if (!comparer.shallow(depsValues, newDepsValues)) {
                viewModel.cleanup && viewModel.cleanup();
                viewModel = vmFactory(currentProps(), VMConstructor);
                // todo: require support for async initialization logic
                viewModel.initialize && viewModel.initialize();
                setContext(VMConstructor.name, viewModel);
            }
            else {
                viewModel.onPropsChanged && viewModel.onPropsChanged(currentProps());
            }
        });
        onDestroy(() => {
            viewModel && viewModel.cleanup && viewModel.cleanup();
        });
    };
    /**
     * Create persistent viewmodel from received props
     * sets the context of 'VMConstructor' type
     * @param Component - component, which receive viewmodel in a prop named after 'vmPropName' argument if 'vmPropName' is provided
     * @param VMConstructor - constructor of the viewmodel. Viewmodel will be created using 'new' operator with this constructor
     *  and passing component's props as a first argument of the constructor
     * @param depsSelector - if returns an array - check this array for shallow equality with the array, returned using the previous props
     * If values does not match previous values - re-create the viewmodel and reset new instance into the context
     */
    const withVM = makeWithVM((props, Constructor) => makeObservable(new Constructor(props)));

    /*! *****************************************************************************
    Copyright (c) Microsoft Corporation.

    Permission to use, copy, modify, and/or distribute this software for any
    purpose with or without fee is hereby granted.

    THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
    REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
    AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
    INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
    LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
    OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
    PERFORMANCE OF THIS SOFTWARE.
    ***************************************************************************** */

    function __decorate(decorators, target, key, desc) {
        var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
        if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
        else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
        return c > 3 && r && Object.defineProperty(target, key, r), r;
    }

    function __metadata(metadataKey, metadataValue) {
        if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(metadataKey, metadataValue);
    }

    var TodoStatus;
    (function (TodoStatus) {
        TodoStatus["Active"] = "active";
        TodoStatus["Completed"] = "completed";
    })(TodoStatus || (TodoStatus = {}));
    class ITodoDAO {
    }

    class TodoDAO extends ITodoDAO {
        getList() {
            return this.getExistingItems();
        }
        create(item) {
            const existingItems = this.getExistingItems();
            let id = 1;
            if (existingItems.length) {
                id = existingItems[existingItems.length - 1].id + 1;
            }
            const newTodo = Object.assign(Object.assign({}, item), { id: id });
            existingItems.push(newTodo);
            this.saveExistingItems(existingItems);
            return newTodo;
        }
        update(item) {
            const existingItems = this.getExistingItems();
            const persistedItem = existingItems.find(x => x.id === item.id);
            if (persistedItem) {
                persistedItem.name = item.name;
                persistedItem.status = item.status;
            }
            this.saveExistingItems(existingItems);
            return persistedItem;
        }
        delete(id) {
            const existingItems = this.getExistingItems();
            const persistedItemIndex = existingItems.findIndex(x => x.id === id);
            existingItems.splice(persistedItemIndex, 1);
            this.saveExistingItems(existingItems);
        }
        getExistingItems() {
            const existingCollection = localStorage.getItem('todos');
            let todoList = [];
            if (existingCollection) {
                todoList = JSON.parse(existingCollection);
            }
            return todoList.sort((a, b) => a.id - b.id);
        }
        saveExistingItems(todos) {
            const stringigied = JSON.stringify(todos);
            localStorage.setItem('todos', stringigied);
        }
    }

    const createConnect = (constructorType) => {
        return (slicingFunction) => {
            const contextKey = constructorType.name;
            const ctx = getContext(contextKey);
            let reactionReference = autorun(() => {
                slicingFunction(ctx);
            });
            onDestroy(() => {
                reactionReference && reactionReference();
            });
            beforeUpdate(() => {
                slicingFunction(ctx);
            });
        };
    };

    // viewmodel does not depends on specific execution context, therefore set props to 'unknown'
    class TodosVM {
        // we don't have any IoC container plugged in for the application so concrete instance is plugged in explicitely
        constructor(props, todoDao = new TodoDAO()) {
            this.todoDao = todoDao;
            this.createTodo = (name) => {
                if (!name || name.trim() === '') {
                    // do not let to create
                    return;
                }
                const newTodo = this.todoDao.create({
                    name: name,
                    status: TodoStatus.Active,
                });
                this.todoList.push(newTodo);
            };
            this.getTodoItems = (filter) => {
                return this.todoList.filter(x => !filter || x.status === filter);
            };
            this.toggleStatus = (id) => {
                const targetItem = this.todoList.find(x => x.id === id);
                if (targetItem) {
                    switch (targetItem.status) {
                        case TodoStatus.Active:
                            targetItem.status = TodoStatus.Completed;
                            break;
                        case TodoStatus.Completed:
                            targetItem.status = TodoStatus.Active;
                            break;
                    }
                }
                this.todoDao.update(targetItem);
            };
            this.setAllStatus = (newStatus) => {
                for (const item of this.todoList) {
                    if (newStatus !== item.status) {
                        item.status = newStatus;
                        this.todoDao.update(item);
                    }
                }
            };
            this.removeTodo = (id) => {
                const targetItemIndex = this.todoList.findIndex(x => x.id === id);
                this.todoList.splice(targetItemIndex, 1);
                this.todoDao.delete(id);
            };
            this.removeCompletedTodos = () => {
                const completedItems = this.todoList.filter(x => x.status === TodoStatus.Completed);
                this.todoList = this.todoList.filter(x => x.status === TodoStatus.Active);
                for (const completedTodo of completedItems) {
                    this.todoDao.delete(completedTodo.id);
                }
            };
            this.todoList = [];
        }
        initialize() {
            this.todoList = this.todoDao.getList();
        }
    }
    __decorate([
        observable,
        __metadata("design:type", Array)
    ], TodosVM.prototype, "todoList", void 0);
    __decorate([
        action,
        __metadata("design:type", Function),
        __metadata("design:paramtypes", []),
        __metadata("design:returntype", void 0)
    ], TodosVM.prototype, "initialize", null);
    __decorate([
        action,
        __metadata("design:type", Object)
    ], TodosVM.prototype, "createTodo", void 0);
    __decorate([
        action,
        __metadata("design:type", Object)
    ], TodosVM.prototype, "toggleStatus", void 0);
    __decorate([
        action,
        __metadata("design:type", Object)
    ], TodosVM.prototype, "setAllStatus", void 0);
    __decorate([
        action,
        __metadata("design:type", Object)
    ], TodosVM.prototype, "removeTodo", void 0);
    __decorate([
        action,
        __metadata("design:type", Object)
    ], TodosVM.prototype, "removeCompletedTodos", void 0);
    const connectTodosVM = createConnect(TodosVM);

    /* app\todo-mvc\_header.svelte generated by Svelte v3.35.0 */
    const file$1 = "app\\todo-mvc\\_header.svelte";

    function create_fragment$3(ctx) {
    	let header;
    	let h1;
    	let t1;
    	let input;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			header = element("header");
    			h1 = element("h1");
    			h1.textContent = "todos";
    			t1 = space();
    			input = element("input");
    			add_location(h1, file$1, 22, 4, 523);
    			attr_dev(input, "class", "new-todo");
    			attr_dev(input, "placeholder", "What needs to be done?");
    			input.autofocus = true;
    			add_location(input, file$1, 23, 4, 543);
    			attr_dev(header, "class", "header");
    			add_location(header, file$1, 21, 0, 494);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, header, anchor);
    			append_dev(header, h1);
    			append_dev(header, t1);
    			append_dev(header, input);
    			input.focus();

    			if (!mounted) {
    				dispose = [
    					listen_dev(input, "keydown", /*handleClick*/ ctx[1], false, false, false),
    					listen_dev(input, "blur", /*handleBlur*/ ctx[0], false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(header);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$3.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$3($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Header", slots, []);
    	let createTodo;

    	connectTodosVM(vm => {
    		createTodo = vm.createTodo;
    	});

    	const handleBlur = e => {
    		e.currentTarget.value = "";
    	};

    	const handleClick = e => {
    		const target = e.currentTarget;

    		if (e.key === "Enter") {
    			const value = target.value;
    			target.value = "";
    			createTodo(value);
    		}

    		if (e.key === "Escape") {
    			target.value = "";
    		}
    	};

    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Header> was created with unknown prop '${key}'`);
    	});

    	$$self.$capture_state = () => ({
    		connectTodosVM,
    		createTodo,
    		handleBlur,
    		handleClick
    	});

    	$$self.$inject_state = $$props => {
    		if ("createTodo" in $$props) createTodo = $$props.createTodo;
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [handleBlur, handleClick];
    }

    class Header extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$3, create_fragment$3, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Header",
    			options,
    			id: create_fragment$3.name
    		});
    	}
    }

    /* app\todo-mvc\_footer.svelte generated by Svelte v3.35.0 */
    const file$2 = "app\\todo-mvc\\_footer.svelte";

    // (24:12) <Link to='/' class={!selectedStatus ? 'selected' : ''}>
    function create_default_slot_2(ctx) {
    	let t;

    	const block = {
    		c: function create() {
    			t = text("All");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_2.name,
    		type: "slot",
    		source: "(24:12) <Link to='/' class={!selectedStatus ? 'selected' : ''}>",
    		ctx
    	});

    	return block;
    }

    // (27:12) <Link to='/active' class={selectedStatus === TodoStatus.Active ? 'selected' : ''}>
    function create_default_slot_1(ctx) {
    	let t;

    	const block = {
    		c: function create() {
    			t = text("active");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_1.name,
    		type: "slot",
    		source: "(27:12) <Link to='/active' class={selectedStatus === TodoStatus.Active ? 'selected' : ''}>",
    		ctx
    	});

    	return block;
    }

    // (30:12) <Link to='/completed' class={selectedStatus === TodoStatus.Completed ? 'selected' : ''}>
    function create_default_slot(ctx) {
    	let t;

    	const block = {
    		c: function create() {
    			t = text("completed");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot.name,
    		type: "slot",
    		source: "(30:12) <Link to='/completed' class={selectedStatus === TodoStatus.Completed ? 'selected' : ''}>",
    		ctx
    	});

    	return block;
    }

    // (33:4) {#if completedItemsCount > 0}
    function create_if_block$1(ctx) {
    	let button;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			button = element("button");
    			button.textContent = "Clear completed";
    			attr_dev(button, "class", "clear-completed");
    			add_location(button, file$2, 33, 8, 1191);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, button, anchor);

    			if (!mounted) {
    				dispose = listen_dev(
    					button,
    					"click",
    					function () {
    						if (is_function(/*clearCompleted*/ ctx[1])) /*clearCompleted*/ ctx[1].apply(this, arguments);
    					},
    					false,
    					false,
    					false
    				);

    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(button);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$1.name,
    		type: "if",
    		source: "(33:4) {#if completedItemsCount > 0}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$4(ctx) {
    	let footer;
    	let span;
    	let strong;
    	let t0;
    	let t1;
    	let t2_value = /*dullPluralize*/ ctx[4](/*activeItemsCount*/ ctx[2]) + "";
    	let t2;
    	let t3;
    	let t4;
    	let ul;
    	let li0;
    	let link0;
    	let t5;
    	let li1;
    	let link1;
    	let t6;
    	let li2;
    	let link2;
    	let t7;
    	let current;

    	link0 = new Link({
    			props: {
    				to: "/",
    				class: !/*selectedStatus*/ ctx[0] ? "selected" : "",
    				$$slots: { default: [create_default_slot_2] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	link1 = new Link({
    			props: {
    				to: "/active",
    				class: /*selectedStatus*/ ctx[0] === TodoStatus.Active
    				? "selected"
    				: "",
    				$$slots: { default: [create_default_slot_1] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	link2 = new Link({
    			props: {
    				to: "/completed",
    				class: /*selectedStatus*/ ctx[0] === TodoStatus.Completed
    				? "selected"
    				: "",
    				$$slots: { default: [create_default_slot] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	let if_block = /*completedItemsCount*/ ctx[3] > 0 && create_if_block$1(ctx);

    	const block = {
    		c: function create() {
    			footer = element("footer");
    			span = element("span");
    			strong = element("strong");
    			t0 = text(/*activeItemsCount*/ ctx[2]);
    			t1 = space();
    			t2 = text(t2_value);
    			t3 = text(" left");
    			t4 = space();
    			ul = element("ul");
    			li0 = element("li");
    			create_component(link0.$$.fragment);
    			t5 = space();
    			li1 = element("li");
    			create_component(link1.$$.fragment);
    			t6 = space();
    			li2 = element("li");
    			create_component(link2.$$.fragment);
    			t7 = space();
    			if (if_block) if_block.c();
    			add_location(strong, file$2, 19, 29, 629);
    			attr_dev(span, "class", "todo-count");
    			add_location(span, file$2, 19, 4, 604);
    			add_location(li0, file$2, 22, 8, 752);
    			add_location(li1, file$2, 25, 8, 860);
    			add_location(li2, file$2, 28, 8, 998);
    			attr_dev(ul, "class", "filters");
    			add_location(ul, file$2, 21, 4, 722);
    			attr_dev(footer, "class", "footer");
    			add_location(footer, file$2, 18, 0, 575);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, footer, anchor);
    			append_dev(footer, span);
    			append_dev(span, strong);
    			append_dev(strong, t0);
    			append_dev(span, t1);
    			append_dev(span, t2);
    			append_dev(span, t3);
    			append_dev(footer, t4);
    			append_dev(footer, ul);
    			append_dev(ul, li0);
    			mount_component(link0, li0, null);
    			append_dev(ul, t5);
    			append_dev(ul, li1);
    			mount_component(link1, li1, null);
    			append_dev(ul, t6);
    			append_dev(ul, li2);
    			mount_component(link2, li2, null);
    			append_dev(footer, t7);
    			if (if_block) if_block.m(footer, null);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (!current || dirty & /*activeItemsCount*/ 4) set_data_dev(t0, /*activeItemsCount*/ ctx[2]);
    			if ((!current || dirty & /*activeItemsCount*/ 4) && t2_value !== (t2_value = /*dullPluralize*/ ctx[4](/*activeItemsCount*/ ctx[2]) + "")) set_data_dev(t2, t2_value);
    			const link0_changes = {};
    			if (dirty & /*selectedStatus*/ 1) link0_changes.class = !/*selectedStatus*/ ctx[0] ? "selected" : "";

    			if (dirty & /*$$scope*/ 32) {
    				link0_changes.$$scope = { dirty, ctx };
    			}

    			link0.$set(link0_changes);
    			const link1_changes = {};

    			if (dirty & /*selectedStatus*/ 1) link1_changes.class = /*selectedStatus*/ ctx[0] === TodoStatus.Active
    			? "selected"
    			: "";

    			if (dirty & /*$$scope*/ 32) {
    				link1_changes.$$scope = { dirty, ctx };
    			}

    			link1.$set(link1_changes);
    			const link2_changes = {};

    			if (dirty & /*selectedStatus*/ 1) link2_changes.class = /*selectedStatus*/ ctx[0] === TodoStatus.Completed
    			? "selected"
    			: "";

    			if (dirty & /*$$scope*/ 32) {
    				link2_changes.$$scope = { dirty, ctx };
    			}

    			link2.$set(link2_changes);

    			if (/*completedItemsCount*/ ctx[3] > 0) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block$1(ctx);
    					if_block.c();
    					if_block.m(footer, null);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(link0.$$.fragment, local);
    			transition_in(link1.$$.fragment, local);
    			transition_in(link2.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(link0.$$.fragment, local);
    			transition_out(link1.$$.fragment, local);
    			transition_out(link2.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(footer);
    			destroy_component(link0);
    			destroy_component(link1);
    			destroy_component(link2);
    			if (if_block) if_block.d();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$4.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$4($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Footer", slots, []);
    	let { selectedStatus } = $$props;
    	let clearCompleted;
    	let activeItemsCount;
    	let completedItemsCount;

    	connectTodosVM(vm => {
    		$$invalidate(1, clearCompleted = vm.removeCompletedTodos);
    		$$invalidate(2, activeItemsCount = vm.getTodoItems(TodoStatus.Active).length);
    		$$invalidate(3, completedItemsCount = vm.getTodoItems(TodoStatus.Completed).length);
    	});

    	const dullPluralize = itemsNumber => {
    		return itemsNumber === 1 ? "item" : "items";
    	};

    	const writable_props = ["selectedStatus"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Footer> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ("selectedStatus" in $$props) $$invalidate(0, selectedStatus = $$props.selectedStatus);
    	};

    	$$self.$capture_state = () => ({
    		connectTodosVM,
    		TodoStatus,
    		Link,
    		selectedStatus,
    		clearCompleted,
    		activeItemsCount,
    		completedItemsCount,
    		dullPluralize
    	});

    	$$self.$inject_state = $$props => {
    		if ("selectedStatus" in $$props) $$invalidate(0, selectedStatus = $$props.selectedStatus);
    		if ("clearCompleted" in $$props) $$invalidate(1, clearCompleted = $$props.clearCompleted);
    		if ("activeItemsCount" in $$props) $$invalidate(2, activeItemsCount = $$props.activeItemsCount);
    		if ("completedItemsCount" in $$props) $$invalidate(3, completedItemsCount = $$props.completedItemsCount);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [
    		selectedStatus,
    		clearCompleted,
    		activeItemsCount,
    		completedItemsCount,
    		dullPluralize
    	];
    }

    class Footer extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$4, create_fragment$4, safe_not_equal, { selectedStatus: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Footer",
    			options,
    			id: create_fragment$4.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*selectedStatus*/ ctx[0] === undefined && !("selectedStatus" in props)) {
    			console.warn("<Footer> was created without expected prop 'selectedStatus'");
    		}
    	}

    	get selectedStatus() {
    		throw new Error("<Footer>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set selectedStatus(value) {
    		throw new Error("<Footer>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* app\todo-mvc\_todo-list\_todo-item.svelte generated by Svelte v3.35.0 */
    const file$3 = "app\\todo-mvc\\_todo-list\\_todo-item.svelte";

    function create_fragment$5(ctx) {
    	let li;
    	let div;
    	let input;
    	let input_checked_value;
    	let t0;
    	let label;
    	let t1;
    	let t2;
    	let button;
    	let li_class_value;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			li = element("li");
    			div = element("div");
    			input = element("input");
    			t0 = space();
    			label = element("label");
    			t1 = text(/*name*/ ctx[0]);
    			t2 = space();
    			button = element("button");
    			attr_dev(input, "class", "toggle");
    			attr_dev(input, "type", "checkbox");
    			input.checked = input_checked_value = /*status*/ ctx[1] === TodoStatus.Completed;
    			add_location(input, file$3, 15, 8, 431);
    			add_location(label, file$3, 16, 8, 548);
    			attr_dev(button, "class", "destroy");
    			add_location(button, file$3, 17, 8, 579);
    			attr_dev(div, "class", "view");
    			add_location(div, file$3, 14, 4, 403);

    			attr_dev(li, "class", li_class_value = /*status*/ ctx[1] === TodoStatus.Completed
    			? "completed"
    			: "");

    			add_location(li, file$3, 13, 0, 334);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, li, anchor);
    			append_dev(li, div);
    			append_dev(div, input);
    			append_dev(div, t0);
    			append_dev(div, label);
    			append_dev(label, t1);
    			append_dev(div, t2);
    			append_dev(div, button);

    			if (!mounted) {
    				dispose = [
    					listen_dev(
    						input,
    						"change",
    						function () {
    							if (is_function(/*toggleStatus*/ ctx[2])) /*toggleStatus*/ ctx[2].apply(this, arguments);
    						},
    						false,
    						false,
    						false
    					),
    					listen_dev(
    						button,
    						"click",
    						function () {
    							if (is_function(/*removeTodo*/ ctx[3])) /*removeTodo*/ ctx[3].apply(this, arguments);
    						},
    						false,
    						false,
    						false
    					)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, [dirty]) {
    			ctx = new_ctx;

    			if (dirty & /*status*/ 2 && input_checked_value !== (input_checked_value = /*status*/ ctx[1] === TodoStatus.Completed)) {
    				prop_dev(input, "checked", input_checked_value);
    			}

    			if (dirty & /*name*/ 1) set_data_dev(t1, /*name*/ ctx[0]);

    			if (dirty & /*status*/ 2 && li_class_value !== (li_class_value = /*status*/ ctx[1] === TodoStatus.Completed
    			? "completed"
    			: "")) {
    				attr_dev(li, "class", li_class_value);
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(li);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$5.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$5($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Todo_item", slots, []);
    	let { name } = $$props;
    	let { id } = $$props;
    	let { status } = $$props;
    	let toggleStatus;
    	let removeTodo;

    	connectTodosVM(vm => {
    		$$invalidate(2, toggleStatus = () => vm.toggleStatus(id));
    		$$invalidate(3, removeTodo = () => vm.removeTodo(id));
    	});

    	const writable_props = ["name", "id", "status"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Todo_item> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ("name" in $$props) $$invalidate(0, name = $$props.name);
    		if ("id" in $$props) $$invalidate(4, id = $$props.id);
    		if ("status" in $$props) $$invalidate(1, status = $$props.status);
    	};

    	$$self.$capture_state = () => ({
    		connectTodosVM,
    		TodoStatus,
    		name,
    		id,
    		status,
    		toggleStatus,
    		removeTodo
    	});

    	$$self.$inject_state = $$props => {
    		if ("name" in $$props) $$invalidate(0, name = $$props.name);
    		if ("id" in $$props) $$invalidate(4, id = $$props.id);
    		if ("status" in $$props) $$invalidate(1, status = $$props.status);
    		if ("toggleStatus" in $$props) $$invalidate(2, toggleStatus = $$props.toggleStatus);
    		if ("removeTodo" in $$props) $$invalidate(3, removeTodo = $$props.removeTodo);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [name, status, toggleStatus, removeTodo, id];
    }

    class Todo_item extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$5, create_fragment$5, safe_not_equal, { name: 0, id: 4, status: 1 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Todo_item",
    			options,
    			id: create_fragment$5.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*name*/ ctx[0] === undefined && !("name" in props)) {
    			console.warn("<Todo_item> was created without expected prop 'name'");
    		}

    		if (/*id*/ ctx[4] === undefined && !("id" in props)) {
    			console.warn("<Todo_item> was created without expected prop 'id'");
    		}

    		if (/*status*/ ctx[1] === undefined && !("status" in props)) {
    			console.warn("<Todo_item> was created without expected prop 'status'");
    		}
    	}

    	get name() {
    		throw new Error("<Todo_item>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set name(value) {
    		throw new Error("<Todo_item>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get id() {
    		throw new Error("<Todo_item>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set id(value) {
    		throw new Error("<Todo_item>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get status() {
    		throw new Error("<Todo_item>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set status(value) {
    		throw new Error("<Todo_item>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* app\todo-mvc\_todo-list\todo-list.svelte generated by Svelte v3.35.0 */
    const file$4 = "app\\todo-mvc\\_todo-list\\todo-list.svelte";

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[4] = list[i];
    	return child_ctx;
    }

    // (23:8) {#each visibleItems as item}
    function create_each_block(ctx) {
    	let todoitem;
    	let current;
    	const todoitem_spread_levels = [/*item*/ ctx[4]];
    	let todoitem_props = {};

    	for (let i = 0; i < todoitem_spread_levels.length; i += 1) {
    		todoitem_props = assign(todoitem_props, todoitem_spread_levels[i]);
    	}

    	todoitem = new Todo_item({ props: todoitem_props, $$inline: true });

    	const block = {
    		c: function create() {
    			create_component(todoitem.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(todoitem, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const todoitem_changes = (dirty & /*visibleItems*/ 2)
    			? get_spread_update(todoitem_spread_levels, [get_spread_object(/*item*/ ctx[4])])
    			: {};

    			todoitem.$set(todoitem_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(todoitem.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(todoitem.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(todoitem, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block.name,
    		type: "each",
    		source: "(23:8) {#each visibleItems as item}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$6(ctx) {
    	let section;
    	let input;
    	let t0;
    	let label;
    	let t2;
    	let ul;
    	let current;
    	let mounted;
    	let dispose;
    	let each_value = /*visibleItems*/ ctx[1];
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	const out = i => transition_out(each_blocks[i], 1, 1, () => {
    		each_blocks[i] = null;
    	});

    	const block = {
    		c: function create() {
    			section = element("section");
    			input = element("input");
    			t0 = space();
    			label = element("label");
    			label.textContent = "Mark all as complete";
    			t2 = space();
    			ul = element("ul");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr_dev(input, "id", "toggle-all");
    			attr_dev(input, "class", "toggle-all");
    			attr_dev(input, "type", "checkbox");
    			add_location(input, file$4, 19, 4, 700);
    			attr_dev(label, "for", "toggle-all");
    			add_location(label, file$4, 20, 4, 798);
    			attr_dev(ul, "class", "todo-list");
    			add_location(ul, file$4, 21, 4, 856);
    			attr_dev(section, "class", "main");
    			add_location(section, file$4, 18, 0, 672);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, section, anchor);
    			append_dev(section, input);
    			append_dev(section, t0);
    			append_dev(section, label);
    			append_dev(section, t2);
    			append_dev(section, ul);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(ul, null);
    			}

    			current = true;

    			if (!mounted) {
    				dispose = listen_dev(
    					input,
    					"click",
    					function () {
    						if (is_function(/*setStatusForAllItems*/ ctx[0])) /*setStatusForAllItems*/ ctx[0].apply(this, arguments);
    					},
    					false,
    					false,
    					false
    				);

    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, [dirty]) {
    			ctx = new_ctx;

    			if (dirty & /*visibleItems*/ 2) {
    				each_value = /*visibleItems*/ ctx[1];
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    						transition_in(each_blocks[i], 1);
    					} else {
    						each_blocks[i] = create_each_block(child_ctx);
    						each_blocks[i].c();
    						transition_in(each_blocks[i], 1);
    						each_blocks[i].m(ul, null);
    					}
    				}

    				group_outros();

    				for (i = each_value.length; i < each_blocks.length; i += 1) {
    					out(i);
    				}

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o: function outro(local) {
    			each_blocks = each_blocks.filter(Boolean);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(section);
    			destroy_each(each_blocks, detaching);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$6.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$6($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Todo_list", slots, []);
    	
    	let { status } = $$props;
    	let setStatusForAllItems;
    	let areAllItemsCompleted;
    	let visibleItems;

    	connectTodosVM(vm => {
    		const hasActiveItems = vm.getTodoItems(TodoStatus.Active).length;
    		const hasCompletedItems = vm.getTodoItems(TodoStatus.Completed).length;
    		areAllItemsCompleted = hasCompletedItems && !hasActiveItems;

    		$$invalidate(0, setStatusForAllItems = () => vm.setAllStatus(areAllItemsCompleted
    		? TodoStatus.Active
    		: TodoStatus.Completed));

    		$$invalidate(1, visibleItems = vm.getTodoItems(status));
    	});

    	const writable_props = ["status"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Todo_list> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ("status" in $$props) $$invalidate(2, status = $$props.status);
    	};

    	$$self.$capture_state = () => ({
    		connectTodosVM,
    		TodoStatus,
    		TodoItem: Todo_item,
    		status,
    		setStatusForAllItems,
    		areAllItemsCompleted,
    		visibleItems
    	});

    	$$self.$inject_state = $$props => {
    		if ("status" in $$props) $$invalidate(2, status = $$props.status);
    		if ("setStatusForAllItems" in $$props) $$invalidate(0, setStatusForAllItems = $$props.setStatusForAllItems);
    		if ("areAllItemsCompleted" in $$props) areAllItemsCompleted = $$props.areAllItemsCompleted;
    		if ("visibleItems" in $$props) $$invalidate(1, visibleItems = $$props.visibleItems);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [setStatusForAllItems, visibleItems, status];
    }

    class Todo_list extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$6, create_fragment$6, safe_not_equal, { status: 2 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Todo_list",
    			options,
    			id: create_fragment$6.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*status*/ ctx[2] === undefined && !("status" in props)) {
    			console.warn("<Todo_list> was created without expected prop 'status'");
    		}
    	}

    	get status() {
    		throw new Error("<Todo_list>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set status(value) {
    		throw new Error("<Todo_list>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* app\todo-mvc\todo-mvc.svelte generated by Svelte v3.35.0 */
    const file$5 = "app\\todo-mvc\\todo-mvc.svelte";

    function create_fragment$7(ctx) {
    	let section;
    	let header;
    	let t0;
    	let todolist;
    	let t1;
    	let footer;
    	let current;
    	header = new Header({ $$inline: true });

    	todolist = new Todo_list({
    			props: { status: /*status*/ ctx[0] },
    			$$inline: true
    		});

    	footer = new Footer({
    			props: { selectedStatus: /*status*/ ctx[0] },
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			section = element("section");
    			create_component(header.$$.fragment);
    			t0 = space();
    			create_component(todolist.$$.fragment);
    			t1 = space();
    			create_component(footer.$$.fragment);
    			attr_dev(section, "class", "todoapp");
    			add_location(section, file$5, 16, 0, 411);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, section, anchor);
    			mount_component(header, section, null);
    			append_dev(section, t0);
    			mount_component(todolist, section, null);
    			append_dev(section, t1);
    			mount_component(footer, section, null);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			const todolist_changes = {};
    			if (dirty & /*status*/ 1) todolist_changes.status = /*status*/ ctx[0];
    			todolist.$set(todolist_changes);
    			const footer_changes = {};
    			if (dirty & /*status*/ 1) footer_changes.selectedStatus = /*status*/ ctx[0];
    			footer.$set(footer_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(header.$$.fragment, local);
    			transition_in(todolist.$$.fragment, local);
    			transition_in(footer.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(header.$$.fragment, local);
    			transition_out(todolist.$$.fragment, local);
    			transition_out(footer.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(section);
    			destroy_component(header);
    			destroy_component(todolist);
    			destroy_component(footer);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$7.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$7($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Todo_mvc", slots, []);
    	let { status } = $$props;

    	withVM(TodosVM, () => {
    		return { status };
    	});

    	const writable_props = ["status"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Todo_mvc> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ("status" in $$props) $$invalidate(0, status = $$props.status);
    	};

    	$$self.$capture_state = () => ({
    		withVM,
    		TodosVM,
    		TodoStatus,
    		Header,
    		Footer,
    		TodoList: Todo_list,
    		status
    	});

    	$$self.$inject_state = $$props => {
    		if ("status" in $$props) $$invalidate(0, status = $$props.status);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [status];
    }

    class Todo_mvc extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$7, create_fragment$7, safe_not_equal, { status: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Todo_mvc",
    			options,
    			id: create_fragment$7.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*status*/ ctx[0] === undefined && !("status" in props)) {
    			console.warn("<Todo_mvc> was created without expected prop 'status'");
    		}
    	}

    	get status() {
    		throw new Error("<Todo_mvc>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set status(value) {
    		throw new Error("<Todo_mvc>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* app\router.svelte generated by Svelte v3.35.0 */

    // (6:1) <Router url={baseUrl}>
    function create_default_slot$1(ctx) {
    	let route0;
    	let t;
    	let route1;
    	let current;

    	route0 = new Route({
    			props: { path: "/:status", component: Todo_mvc },
    			$$inline: true
    		});

    	route1 = new Route({
    			props: { path: "/", component: Todo_mvc },
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(route0.$$.fragment);
    			t = space();
    			create_component(route1.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(route0, target, anchor);
    			insert_dev(target, t, anchor);
    			mount_component(route1, target, anchor);
    			current = true;
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;
    			transition_in(route0.$$.fragment, local);
    			transition_in(route1.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(route0.$$.fragment, local);
    			transition_out(route1.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(route0, detaching);
    			if (detaching) detach_dev(t);
    			destroy_component(route1, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot$1.name,
    		type: "slot",
    		source: "(6:1) <Router url={baseUrl}>",
    		ctx
    	});

    	return block;
    }

    function create_fragment$8(ctx) {
    	let router;
    	let current;

    	router = new Router({
    			props: {
    				url: /*baseUrl*/ ctx[0],
    				$$slots: { default: [create_default_slot$1] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(router.$$.fragment);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			mount_component(router, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			const router_changes = {};
    			if (dirty & /*baseUrl*/ 1) router_changes.url = /*baseUrl*/ ctx[0];

    			if (dirty & /*$$scope*/ 2) {
    				router_changes.$$scope = { dirty, ctx };
    			}

    			router.$set(router_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(router.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(router.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(router, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$8.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$8($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Router", slots, []);
    	let { baseUrl = "" } = $$props;
    	const writable_props = ["baseUrl"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Router> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ("baseUrl" in $$props) $$invalidate(0, baseUrl = $$props.baseUrl);
    	};

    	$$self.$capture_state = () => ({ Router, Route, TodoMvc: Todo_mvc, baseUrl });

    	$$self.$inject_state = $$props => {
    		if ("baseUrl" in $$props) $$invalidate(0, baseUrl = $$props.baseUrl);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [baseUrl];
    }

    class Router_1 extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$8, create_fragment$8, safe_not_equal, { baseUrl: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Router_1",
    			options,
    			id: create_fragment$8.name
    		});
    	}

    	get baseUrl() {
    		throw new Error("<Router>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set baseUrl(value) {
    		throw new Error("<Router>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    const basePath = "/";
    new Router_1({
        target: document.body,
        props: {
            baseUrl: basePath
        }
    });
    // const ctx = new TodosVM({status: TodoStatus.Active});
    // mobx.makeObservable(ctx);
    // setInterval(() => {
    //     ctx.createTodo('asd')
    // }, 1000);
    // mobx.autorun(() => {
    //     console.log(ctx.getTodoItems(TodoStatus.Active).length);
    //     console.log(ctx.getTodoItems(TodoStatus.Completed).length);
    //     const keke = ctx.getTodoItems();
    //     console.log(keke.length);
    // });
    // ReactDOM.render(
    //     <React.StrictMode>
    //         {/* use string for simplicity. in real life application should be extracted into runtime settings  */}
    //         <BrowserRouter basename={basePath}>
    //             <Route 
    //                 path="/:todostatus?"
    //                 render={({ match }) => {
    //                     return <>
    //                         <TodoMVC status={match.params.todostatus} />
    //                     </>;
    //                   }}>
    //             </Route>
    //             <footer className="info">
    //                 <p>Double-click to edit a todo</p>
    //                 <p>Created by <a href="http://todomvc.com">Dani Jug</a></p>
    //                 <p>Part of <a href="http://todomvc.com">TodoMVC</a></p>
    //             </footer>
    //         </BrowserRouter>
    //     </React.StrictMode>,
    //     document.getElementById('todomvc-root')
    // );

}());
//# sourceMappingURL=app.js.map
