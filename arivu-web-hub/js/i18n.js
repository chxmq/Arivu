// Arivu i18n — lightweight UI localisation for the command dashboard.
// Demo-grade dictionary (EN / Malayalam / Kannada / Tamil / Hindi). Field
// languages of the Western Ghats communities. Native review recommended
// before production. Elder corpus content is never machine-translated —
// only the interface chrome is localised here.
(function (global) {
  const LANGS = [
    { code: "en", label: "English" },
    { code: "ml", label: "മലയാളം" },
    { code: "kn", label: "ಕನ್ನಡ" },
    { code: "ta", label: "தமிழ்" },
    { code: "hi", label: "हिन्दी" },
  ];

  // key → { en, ml, kn, ta, hi }
  const DICT = {
    "nav.overview": { en: "Overview", ml: "അവലോകനം", kn: "ಅವಲೋಕನ", ta: "கண்ணோட்டம்", hi: "अवलोकन" },
    "nav.knowledge": { en: "Knowledge", ml: "അറിവ്", kn: "ಜ್ಞಾನ", ta: "அறிவு", hi: "ज्ञान" },
    "nav.sentinels": { en: "Sentinels", ml: "കാവൽപ്പെട്ടികൾ", kn: "ಕಾವಲು ಪೆಟ್ಟಿಗೆಗಳು", ta: "காவல் பெட்டிகள்", hi: "प्रहरी" },
    "nav.areas": { en: "Areas", ml: "പ്രദേശങ്ങൾ", kn: "ಪ್ರದೇಶಗಳು", ta: "பகுதிகள்", hi: "क्षेत्र" },
    "nav.map": { en: "Map", ml: "ഭൂപടം", kn: "ನಕ್ಷೆ", ta: "வரைபடம்", hi: "नक्शा" },

    "sub.overview": { en: "Western Ghats field operations", ml: "പശ്ചിമഘട്ട ഫീൽഡ് പ്രവർത്തനങ്ങൾ", kn: "ಪಶ್ಚಿಮ ಘಟ್ಟ ಕ್ಷೇತ್ರ ಕಾರ್ಯಾಚರಣೆ", ta: "மேற்குத் தொடர்ச்சி மலை செயல்பாடுகள்", hi: "पश्चिमी घाट क्षेत्र संचालन" },
    "sub.knowledge": { en: "Elder corpus — structured & exportable", ml: "മൂപ്പന്മാരുടെ അറിവ് — ഘടനാപരം", kn: "ಹಿರಿಯರ ಜ್ಞಾನ — ರಚನಾತ್ಮಕ", ta: "மூப்பர் அறிவு — கட்டமைக்கப்பட்டது", hi: "बुज़ुर्गों का ज्ञान — संरचित" },
    "sub.sentinels": { en: "Kaavu box health, telemetry & live feeds", ml: "കാവ് പെട്ടി ആരോഗ്യവും തത്സമയ വിവരവും", kn: "ಕಾವು ಪೆಟ್ಟಿಗೆ ಆರೋಗ್ಯ ಮತ್ತು ನೇರ ಮಾಹಿತಿ", ta: "காவு பெட்டி நிலை மற்றும் நேரடித் தகவல்", hi: "कावु बॉक्स स्थिति व लाइव डेटा" },
    "sub.areas": { en: "Corpus & sentinels grouped by region", ml: "പ്രദേശം അനുസരിച്ച് ക്രമീകരിച്ചത്", kn: "ಪ್ರದೇಶವಾರು ಗುಂಪು", ta: "பகுதி வாரியாக தொகுக்கப்பட்டது", hi: "क्षेत्र अनुसार समूहित" },
    "sub.map": { en: "Corpus entries and sentinel positions", ml: "രേഖകളും കാവൽപ്പെട്ടി സ്ഥാനങ്ങളും", kn: "ದಾಖಲೆಗಳು ಮತ್ತು ಸ್ಥಾನಗಳು", ta: "பதிவுகள் மற்றும் இடங்கள்", hi: "प्रविष्टियाँ और स्थान" },

    "btn.activity": { en: "Activity", ml: "പ്രവർത്തനം", kn: "ಚಟುವಟಿಕೆ", ta: "செயல்பாடு", hi: "गतिविधि" },
    "btn.refresh": { en: "Refresh", ml: "പുതുക്കുക", kn: "ರಿಫ್ರೆಶ್", ta: "புதுப்பி", hi: "ताज़ा करें" },
    "btn.export": { en: "Export CSV", ml: "CSV കയറ്റുമതി", kn: "CSV ರಫ್ತು", ta: "CSV ஏற்று", hi: "CSV निर्यात" },
    "btn.register": { en: "Register box", ml: "പെട്ടി രജിസ്റ്റർ", kn: "ಪೆಟ್ಟಿಗೆ ನೋಂದಣಿ", ta: "பெட்டி பதிவு", hi: "बॉक्स पंजीकरण" },
    "theme.light": { en: "Light", ml: "വെളിച്ചം", kn: "ಬೆಳಕು", ta: "ஒளி", hi: "उजाला" },
    "theme.dark": { en: "Dark", ml: "ഇരുട്ട്", kn: "ಕತ್ತಲು", ta: "இருள்", hi: "अंधेरा" },

    "stat.corpus": { en: "Corpus entries", ml: "രേഖകൾ", kn: "ದಾಖಲೆಗಳು", ta: "பதிவுகள்", hi: "प्रविष्टियाँ" },
    "stat.sentinels": { en: "Sentinels online", ml: "ഓൺലൈൻ കാവൽ", kn: "ಆನ್‌ಲೈನ್ ಕಾವಲು", ta: "இணைப்பில் காவல்", hi: "ऑनलाइन प्रहरी" },
    "stat.typec": { en: "Type C predictions", ml: "ടൈപ്പ് C പ്രവചനങ്ങൾ", kn: "ಟೈಪ್ C ಮುನ್ಸೂಚನೆ", ta: "வகை C முன்னறிவிப்பு", hi: "टाइप C भविष्यवाणी" },
    "stat.pending": { en: "Pending validation", ml: "സ്ഥിരീകരണം ബാക്കി", kn: "ಪರಿಶೀಲನೆ ಬಾಕಿ", ta: "சரிபார்ப்பு நிலுவை", hi: "सत्यापन लंबित" },

    "panel.fieldmap": { en: "Field map", ml: "ഫീൽഡ് ഭൂപടം", kn: "ಕ್ಷೇತ್ರ ನಕ್ಷೆ", ta: "கள வரைபடம்", hi: "क्षेत्र नक्शा" },
    "panel.sentinelhealth": { en: "Sentinel health", ml: "കാവൽ ആരോഗ്യം", kn: "ಕಾವಲು ಆರೋಗ್ಯ", ta: "காவல் நிலை", hi: "प्रहरी स्थिति" },
    "panel.alerts": { en: "Live alert feed", ml: "തത്സമയ മുന്നറിയിപ്പ്", kn: "ನೇರ ಎಚ್ಚರಿಕೆ", ta: "நேரடி எச்சரிக்கை", hi: "लाइव चेतावनी" },
    "panel.recent": { en: "Recent syncs", ml: "സമീപകാല സമന്വയം", kn: "ಇತ್ತೀಚಿನ ಸಿಂಕ್", ta: "சமீபத்திய ஒத்திசைவு", hi: "हाल की सिंक" },
    "panel.tribedist": { en: "Tribe distribution", ml: "ഗോത്ര വിതരണം", kn: "ಬುಡಕಟ್ಟು ಹಂಚಿಕೆ", ta: "பழங்குடி பகிர்வு", hi: "जनजाति वितरण" },
    "panel.knowledgestore": { en: "Knowledge store", ml: "അറിവ് ശേഖരം", kn: "ಜ್ಞಾನ ಸಂಗ್ರಹ", ta: "அறிவுக் களஞ்சியம்", hi: "ज्ञान भंडार" },
    "panel.boxes": { en: "Kaavu sentinel boxes", ml: "കാവ് കാവൽപ്പെട്ടികൾ", kn: "ಕಾವು ಕಾವಲು ಪೆಟ್ಟಿಗೆಗಳು", ta: "காவு காவல் பெட்டிகள்", hi: "कावु प्रहरी बॉक्स" },
    "panel.feeds": { en: "Live feeds", ml: "തത്സമയ ഫീഡുകൾ", kn: "ನೇರ ಫೀಡ್‌ಗಳು", ta: "நேரடி ஊட்டங்கள்", hi: "लाइव फ़ीड" },
    "panel.areas": { en: "Operating areas", ml: "പ്രവർത്തന പ്രദേശങ്ങൾ", kn: "ಕಾರ್ಯ ಪ್ರದೇಶಗಳು", ta: "செயல்படும் பகுதிகள்", hi: "संचालन क्षेत्र" },
    "panel.opsmap": { en: "Operations map", ml: "പ്രവർത്തന ഭൂപടം", kn: "ಕಾರ್ಯಾಚರಣೆ ನಕ್ಷೆ", ta: "செயல்பாட்டு வரைபடம்", hi: "संचालन नक्शा" },
    "drawer.activity": { en: "Activity log", ml: "പ്രവർത്തന ലോഗ്", kn: "ಚಟುವಟಿಕೆ ಲಾಗ್", ta: "செயல்பாட்டு பதிவு", hi: "गतिविधि लॉग" },
    "search.placeholder": { en: "Search corpus…", ml: "തിരയുക…", kn: "ಹುಡುಕಿ…", ta: "தேடு…", hi: "खोजें…" },
  };

  let current = "en";

  function t(key) {
    const row = DICT[key];
    if (!row) return key;
    return row[current] || row.en || key;
  }

  function apply(root) {
    (root || document).querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });
    (root || document).querySelectorAll("[data-i18n-ph]").forEach((el) => {
      el.setAttribute("placeholder", t(el.dataset.i18nPh));
    });
    document.documentElement.setAttribute("lang", current);
  }

  function setLang(code) {
    current = DICT["nav.map"][code] ? code : "en";
    try { localStorage.setItem("arivu-lang", current); } catch (_) {}
    apply();
    if (global.ArivuCommand && global.ArivuCommand.onLangChange) {
      global.ArivuCommand.onLangChange(current);
    }
  }

  function init() {
    let saved = "en";
    try {
      const urlLang = new URLSearchParams(location.search).get("lang");
      saved = urlLang || localStorage.getItem("arivu-lang") || "en";
    } catch (_) {}
    current = DICT["nav.map"][saved] ? saved : "en";
  }
  init();

  global.ArivuI18n = { LANGS, t, apply, setLang, getLang: () => current };
})(window);
