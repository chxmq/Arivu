// Seed corpus + clickable example prompts for the demo.
(function (global) {
  // Pre-taught entries so ASK + the map have content on first load.
  const SEED = [
    {
      transcript: "When the cuckoo, the kuyil, calls before dawn, the monsoon rain arrives in about seven to ten days.",
      meta: { elder_id: "WYD_042", location: "Wayanad", geohash: "tdr7h2", lat: 11.6854, lng: 76.132 },
    },
    {
      transcript: "We call it Cheevakka. The bark paste with water is used to treat fever. It grows near the streams.",
      meta: { elder_id: "WYD_017", location: "Wayanad", geohash: "tdr7h0", lat: 11.70, lng: 76.08 },
    },
    {
      transcript: "The Pala tree, ezhilampala, flowers strongly just before the second rains come in about ten days.",
      meta: { elder_id: "WYD_031", location: "Wayanad", geohash: "tdr7j1", lat: 11.61, lng: 76.21 },
    },
    {
      transcript: "This is Neem, we call it Aryaveppu. The leaves keep insects away from stored grain.",
      meta: { elder_id: "BRH_004", location: "BR Hills", geohash: "tdnk9p", lat: 11.97, lng: 77.14 },
    },
  ];

  // Example prompts grouped by what they demonstrate. Each has a label + the text.
  const EXAMPLES = {
    teach: [
      { tag: "Type C", note: "prediction → validatable", text: "When the cuckoo calls before dawn, the monsoon comes in about eight days." },
      { tag: "Type C", note: "flowering → rain", text: "When the Pala tree flowers strongly, the rains arrive in around ten days." },
      { tag: "Type C", note: "frogs → rain", text: "Once the frogs begin their night chorus, heavy rain follows within three days." },
      { tag: "Type B", note: "medicinal → COMMUNITY", text: "The Cheevakka bark made into a paste with water is used to bring down a fever." },
      { tag: "Type B", note: "ritual → COMMUNITY", text: "The flowers of this sacred tree are used in the grove ceremony before the harvest." },
      { tag: "Type A", note: "identification", text: "We call this tree Aryaveppu, the neem. It grows tall near the temple." },
      { tag: "Type A", note: "identification", text: "This is what we call Plavu, the jackfruit tree, it grows tall near the houses." },
    ],
    ask: [
      "What tells us the monsoon is coming?",
      "How do we treat a fever?",
      "What keeps insects away from grain?",
      "Tell me about the Pala tree.",
      "What does the cuckoo mean?",
    ],
  };

  global.ArivuData = { SEED: SEED, EXAMPLES: EXAMPLES };
})(window);
