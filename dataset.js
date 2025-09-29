(function () {
  // Lightweight client-side dataset collector with download helper
  const records = [];

  function addRecord(type, payload) {
    const ts = Date.now();
    const d = new Date(ts);
    records.push({
      type,
      at: ts,
      iso: d.toISOString(),
      localDate: d.toLocaleDateString(),
      localTime: d.toLocaleTimeString(),
      payload
    });
  }

  // Event listeners for key signals
  window.addEventListener('emotionchange', (e) => {
    addRecord('emotionchange', {
      emotion: e.detail?.emotion ?? null
    });
  });

  window.addEventListener('heartrate', (e) => {
    addRecord('heartrate', {
      value: e.detail?.value ?? null,
      average: e.detail?.average ?? null
    });
  });

  window.addEventListener('stressdetected', (e) => {
    addRecord('stressdetected', {
      type: e.detail?.type ?? null,
      value: e.detail?.value ?? null,
      average: e.detail?.average ?? null
    });
  });

  function exportJSON() {
    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
      count: records.length,
      records
    }, null, 2);
  }

  function download(filename = 'result_dataset.json') {
    const blob = new Blob([exportJSON()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  window.DatasetStore = {
    add: addRecord,
    getAll: () => records.slice(),
    clear: () => { records.length = 0; },
    exportJSON,
    download
  };
})();


