// Central state + event bus — every layer listens and reacts.
(function (global) {
  const listeners = {};
  const state = {
    activeLayer: "idle",
    corpus: [],
    lastEntry: null,
    lastValidation: null,
    selectedEntryId: null,
    stats: { taught: 0, structured: 0, validated: 0, asked: 0 },
    flowLog: [],
  };

  function on(event, fn) {
    (listeners[event] = listeners[event] || []).push(fn);
    return () => {
      listeners[event] = (listeners[event] || []).filter((f) => f !== fn);
    };
  }

  function emit(event, payload) {
    (listeners[event] || []).forEach((fn) => fn(payload, state));
    (listeners["*"] || []).forEach((fn) => fn(event, payload, state));
  }

  function set(partial) {
    Object.assign(state, partial);
    emit("change", partial);
  }

  function logFlow(msg) {
    const entry = { time: new Date().toLocaleTimeString(), msg };
    state.flowLog.unshift(entry);
    if (state.flowLog.length > 12) state.flowLog.pop();
    emit("flow", entry);
  }

  function bumpStat(key) {
    state.stats[key] = (state.stats[key] || 0) + 1;
    emit("stats", state.stats);
  }

  global.ArivuState = {
    get: () => state,
    set,
    on,
    emit,
    logFlow,
    bumpStat,
  };
})(window);
