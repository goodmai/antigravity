/**
 * Daskibo Academy — i18n module
 * Supported: en, ru, es, zh, ar, fr
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'daskibo_lang';

  var LANGS = {
    en: { flag: '🇬🇧', label: 'English', dir: 'ltr' },
    ru: { flag: '🇷🇺', label: 'Русский', dir: 'ltr' },
    es: { flag: '🇪🇸', label: 'Español', dir: 'ltr' },
    zh: { flag: '🇨🇳', label: '中文', dir: 'ltr' },
    ar: { flag: '🇸🇦', label: 'العربية', dir: 'rtl' },
    fr: { flag: '🇫🇷', label: 'Français', dir: 'ltr' },
    it: { flag: '🇮🇹', label: 'Italiano', dir: 'ltr' },
    id: { flag: '🇮🇩', label: 'Bahasa Indonesia', dir: 'ltr' },
  };

  var TRANSLATIONS = {
    /* ── Navigation ─────────────────────────────────── */
    nav_home: {
      en: 'Home', ru: 'Главная', es: 'Inicio',
      zh: '首页', ar: 'الرئيسية', fr: 'Accueil',
    },
    nav_courses: {
      en: 'Courses', ru: 'Курсы', es: 'Cursos',
      zh: '课程', ar: 'الدورات', fr: 'Cours',
    },
    nav_login: {
      en: 'Login', ru: 'Войти', es: 'Entrar',
      zh: '登录', ar: 'تسجيل الدخول', fr: 'Connexion',
    },
    nav_signup: {
      en: 'Sign Up', ru: 'Регистрация', es: 'Registrarse',
      zh: '注册', ar: 'إنشاء حساب', fr: "S'inscrire",
    },
    /* ── Hero ────────────────────────────────────────── */
    hero_title: {
      en: 'Daskibo Academy', ru: 'Daskibo Academy', es: 'Daskibo Academy',
      zh: 'Daskibo 学院', ar: 'أكاديمية داسكيبو', fr: 'Daskibo Academy',
    },
    hero_subtitle: {
      en: 'Mastery in AI, Blockchain, Rust & the next frontier of engineering.',
      ru: 'Мастерство в AI, блокчейне, Rust и инженерии будущего.',
      es: 'Dominio en IA, Blockchain, Rust e ingeniería del futuro.',
      zh: '精通 AI、区块链、Rust 与未来工程。',
      ar: 'إتقان في الذكاء الاصطناعي والبلوكتشين وRust وهندسة المستقبل.',
      fr: "Maîtrise de l'IA, de la Blockchain, de Rust et de l'ingénierie future.",
    },
    /* ── Courses ─────────────────────────────────────── */
    courses_heading: {
      en: 'Courses', ru: 'Курсы', es: 'Cursos',
      zh: '课程', ar: 'الدورات', fr: 'Cours',
    },
    badge_available: {
      en: 'Available', ru: 'Доступно', es: 'Disponible',
      zh: '可用', ar: 'متاح', fr: 'Disponible',
    },
    badge_coming_soon: {
      en: 'Coming Soon', ru: 'Скоро', es: 'Próximamente',
      zh: '即将推出', ar: 'قريباً', fr: 'Bientôt',
    },
    /* ── Course cards ────────────────────────────────── */
    course_antigravity_title: {
      en: 'Antigravity', ru: 'Antigravity', es: 'Antigravity',
      zh: 'Antigravity', ar: 'Antigravity', fr: 'Antigravity',
    },
    course_antigravity_desc: {
      en: 'Autonomous AI agents, MCP, multi-agent orchestration and the full SDLC with Antigravity IDE.',
      ru: 'Автономные AI-агенты, MCP, многоагентная оркестрация и полный SDLC с Antigravity IDE.',
      es: 'Agentes IA autónomos, MCP, orquestación multi-agente y el SDLC completo con Antigravity IDE.',
      zh: '自主 AI 智能体、MCP、多智能体编排与 Antigravity IDE 全生命周期开发。',
      ar: 'وكلاء الذكاء الاصطناعي المستقلون، MCP، تنسيق متعدد الوكلاء ودورة تطوير البرمجيات مع Antigravity IDE.',
      fr: "Agents IA autonomes, MCP, orchestration multi-agents et le cycle SDLC complet avec Antigravity IDE.",
    },
    course_claude_title: {
      en: 'Claude Code', ru: 'Claude Code', es: 'Claude Code',
      zh: 'Claude Code', ar: 'Claude Code', fr: 'Claude Code',
    },
    course_claude_desc: {
      en: 'The definitive course on Claude Code CLI — from first prompt to production-grade agents.',
      ru: 'Полный курс по Claude Code CLI — от первого промпта до агентов промышленного уровня.',
      es: 'El curso definitivo sobre Claude Code CLI — del primer prompt a agentes de nivel productivo.',
      zh: 'Claude Code CLI 权威课程——从第一个提示词到生产级智能体。',
      ar: 'الدورة الشاملة حول Claude Code CLI — من أول موجه إلى وكلاء على مستوى الإنتاج.',
      fr: "Le cours définitif sur Claude Code CLI — du premier prompt aux agents de niveau production.",
    },
    course_rust_title: {
      en: 'Rust on Android', ru: 'Rust on Android', es: 'Rust en Android',
      zh: 'Android 上的 Rust', ar: 'Rust على أندرويد', fr: 'Rust sur Android',
    },
    course_rust_desc: {
      en: 'Build high-performance Android apps with Rust via JNI, NDK and cross-compilation pipelines.',
      ru: 'Высокопроизводительные Android-приложения на Rust с JNI, NDK и кросс-компиляцией.',
      es: 'Crea apps Android de alto rendimiento con Rust vía JNI, NDK y compilación cruzada.',
      zh: '通过 JNI、NDK 和交叉编译流水线用 Rust 构建高性能 Android 应用。',
      ar: 'بناء تطبيقات أندرويد عالية الأداء باستخدام Rust عبر JNI وNDK وخطوط التجميع المتقاطع.',
      fr: "Construisez des applis Android hautes performances avec Rust via JNI, NDK et compilation croisée.",
    },
    course_web3_title: {
      en: 'Web3 Genesis', ru: 'Web3 Genesis', es: 'Web3 Génesis',
      zh: 'Web3 创世纪', ar: 'Web3 جينيسيس', fr: 'Web3 Genèse',
    },
    course_web3_desc: {
      en: 'Solidity, smart contracts, DeFi protocols and dApp development on EVM-compatible chains.',
      ru: 'Solidity, смарт-контракты, DeFi-протоколы и разработка dApp на EVM-совместимых сетях.',
      es: 'Solidity, contratos inteligentes, protocolos DeFi y desarrollo de dApps en cadenas EVM.',
      zh: 'Solidity、智能合约、DeFi 协议与 EVM 兼容链上的 dApp 开发。',
      ar: 'Solidity، العقود الذكية، بروتوكولات DeFi وتطوير dApp على سلاسل EVM.',
      fr: "Solidity, contrats intelligents, protocoles DeFi et développement de dApps sur chaînes EVM.",
    },
    course_dapp_title: {
      en: 'Decentralized Application Architecture', ru: 'Архитектура децентрализованного приложения',
      es: 'Arquitectura de aplicaciones descentralizadas', zh: '去中心化应用架构',
      ar: 'بنية التطبيقات اللامركزية', fr: "Architecture d'application décentralisée",
    },
    course_dapp_desc: {
      en: 'One product designed three ways on a fixed 9-brick grid: classic, Google Cloud and decentralized analogues. Trade-offs, ADRs, C4 diagrams and a 9×3 capstone choice matrix instead of memorizing a stack.',
      ru: 'Один продукт, спроектированный тремя способами по неизменной сетке из 9 «кирпичей»: классика, облако Google и децентрализованные аналоги. Trade-off, ADR, C4-диаграммы и capstone-матрица выбора 9×3 вместо зубрёжки стека.',
      es: 'Un producto diseñado de tres formas sobre una rejilla fija de 9 bloques: clásico, Google Cloud y análogos descentralizados. Trade-offs, ADR, diagramas C4 y una matriz de elección 9×3.',
      zh: '同一产品在固定的 9 块网格上以三种方式设计：经典、Google Cloud 和去中心化对应方案。权衡、ADR、C4 图与 9×3 选型矩阵。',
      ar: 'منتج واحد مصمم بثلاث طرق على شبكة ثابتة من 9 لبنات: الكلاسيكي، Google Cloud والنظائر اللامركزية. مقايضات وADR ومخططات C4 ومصفوفة اختيار 9×3.',
      fr: "Un produit conçu de trois façons sur une grille fixe de 9 briques : classique, Google Cloud et analogues décentralisés. Trade-offs, ADR, diagrammes C4 et matrice de choix 9×3.",
    },
    course_devsecops_title: {
      en: '<span style="white-space: nowrap;">CI/CD</span> DevSecOps Mastery',
      ru: '<span style="white-space: nowrap;">CI/CD</span> DevSecOps Mastery',
      es: '<span style="white-space: nowrap;">CI/CD</span> DevSecOps Mastery',
      zh: '<span style="white-space: nowrap;">CI/CD</span> DevSecOps Mastery',
      ar: '<span style="white-space: nowrap;">CI/CD</span> DevSecOps Mastery',
      fr: '<span style="white-space: nowrap;">CI/CD</span> DevSecOps Mastery',
    },
    course_devsecops_desc: {
      en: 'From git push to signed multi-arch container in EKS & Akash. Packaging (Ubuntu/brew/iOS/Android), SonarQube + Trivy + cosign, Vault + OIDC + WebAuthn, Prometheus/Grafana/InfluxDB, Telegram/Slack/Discord alerts. Sandbox-first, no cloud bills required.',
      ru: 'От git push до подписанного multi-arch контейнера в EKS и Akash. Сборка (Ubuntu/brew/iOS/Android), SonarQube + Trivy + cosign, Vault + OIDC + WebAuthn, Prometheus/Grafana/InfluxDB, Telegram/Slack/Discord. Sandbox-first, без облачных счетов.',
      es: 'Desde git push hasta un contenedor multi-arch firmado en EKS y Akash. Empaquetado, SonarQube + Trivy + cosign, Vault + OIDC + WebAuthn, Prometheus/Grafana/InfluxDB, alertas. Sandbox-first, sin facturas en la nube.',
      zh: '从 git push 到 EKS 和 Akash 中签名的 multi-arch 容器。打包、SonarQube + Trivy + cosign、Vault + OIDC + WebAuthn、Prometheus/Grafana/InfluxDB。Sandbox-first，无需云账单。',
      ar: 'من git push إلى حاوية multi-arch موقعة في EKS و Akash. حزم، SonarQube + Trivy + cosign، Vault + OIDC + WebAuthn، Prometheus/Grafana/InfluxDB. بيئة اختبار أولاً، بدون فواتير سحابية.',
      fr: 'De git push au conteneur multi-arch signé dans EKS & Akash. Packaging, SonarQube + Trivy + cosign, Vault + OIDC + WebAuthn, Prometheus/Grafana/InfluxDB. Sandbox-first, sans factures cloud.',
    },
    /* ── Auth ────────────────────────────────────────── */
    auth_connect_metamask: {
      en: 'Connect MetaMask', ru: 'Подключить MetaMask', es: 'Conectar MetaMask',
      zh: '连接 MetaMask', ar: 'ربط MetaMask', fr: 'Connecter MetaMask',
    },
    auth_login_title: {
      en: 'Log In with MetaMask', ru: 'Войти через MetaMask', es: 'Entrar con MetaMask',
      zh: '使用 MetaMask 登录', ar: 'تسجيل الدخول عبر MetaMask', fr: 'Se connecter avec MetaMask',
    },
    auth_signup_title: {
      en: 'Create Account', ru: 'Создать аккаунт', es: 'Crear cuenta',
      zh: '创建账户', ar: 'إنشاء حساب', fr: 'Créer un compte',
    },
    auth_sign_message: {
      en: 'Sign message to verify ownership', ru: 'Подписать сообщение для верификации',
      es: 'Firmar mensaje para verificar', zh: '签名消息以验证所有权',
      ar: 'توقيع الرسالة للتحقق من الملكية', fr: 'Signer le message pour vérifier',
    },
    auth_no_metamask: {
      en: 'MetaMask not detected. Please install it first.',
      ru: 'MetaMask не обнаружен. Установите расширение.',
      es: 'MetaMask no detectado. Instálalo primero.',
      zh: '未检测到 MetaMask，请先安装。',
      ar: 'لم يتم اكتشاف MetaMask. يرجى تثبيته أولاً.',
      fr: "MetaMask non détecté. Veuillez l'installer d'abord.",
    },
    /* ── Theme ───────────────────────────────────────── */
    theme_dark: {
      en: 'Dark', ru: 'Тёмная', es: 'Oscuro',
      zh: '深色', ar: 'داكن', fr: 'Sombre',
    },
    theme_light: {
      en: 'Light', ru: 'Светлая', es: 'Claro',
      zh: '浅色', ar: 'فاتح', fr: 'Clair',
    },
    /* ── Footer ──────────────────────────────────────── */
    footer_copy: {
      en: 'Daskibo Academy © 2026', ru: 'Daskibo Academy © 2026', es: 'Daskibo Academy © 2026',
      zh: 'Daskibo Academy © 2026', ar: '© 2026 أكاديمية داسكيبو', fr: 'Daskibo Academy © 2026',
    },
    /* ── Course page ─────────────────────────────────── */
    lessons_label: {
      en: 'Lessons', ru: 'Уроки', es: 'Lecciones',
      zh: '课程单元', ar: 'الدروس', fr: 'Leçons',
    },
    labs_label: {
      en: 'Labs', ru: 'Лабораторные', es: 'Laboratorios',
      zh: '实验室', ar: 'المختبرات', fr: 'Labos',
    },
    coming_soon_detail: {
      en: 'This course is under development. Stay tuned!',
      ru: 'Курс в разработке. Следите за обновлениями!',
      es: 'Este curso está en desarrollo. ¡Mantente atento!',
      zh: '课程正在开发中，敬请期待！',
      ar: 'هذه الدورة قيد التطوير. ترقبوا المزيد!',
      fr: "Ce cours est en développement. Restez à l'écoute !",
    },
    view_course: {
      en: 'View Course', ru: 'Перейти к курсу', es: 'Ver curso',
      zh: '查看课程', ar: 'عرض الدورة', fr: 'Voir le cours',
    },
  };

  function getSaved() {
    try {
      var lang = localStorage.getItem(STORAGE_KEY);
      if (!lang) {
        // Migration from old key
        lang = localStorage.getItem('antigravity_lang');
        if (lang) {
          localStorage.setItem(STORAGE_KEY, lang);
          localStorage.removeItem('antigravity_lang');
        }
      }
      return lang || 'en';
    } catch (e) { return 'en'; }
  }

  function setSaved(lang) {
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}
  }

  function t(key, lang) {
    var l = lang || getSaved();
    var entry = TRANSLATIONS[key];
    if (!entry) return key;
    return entry[l] || entry['en'] || key;
  }

  function applyLang(lang) {
    if (!LANGS[lang]) lang = 'en';
    setSaved(lang);

    var dir = LANGS[lang].dir;
    document.documentElement.setAttribute('lang', lang);
    document.documentElement.setAttribute('dir', dir);

    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      var val = t(key, lang);
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.placeholder = val;
      } else {
        el.innerHTML = val;
      }
    });

    document.querySelectorAll('[data-i18n-title]').forEach(function (el) {
      el.title = t(el.getAttribute('data-i18n-title'), lang);
    });

    /* highlight active flag */
    document.querySelectorAll('.lang-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.lang === lang);
    });

    /* fire custom event for pages that need extra logic */
    document.dispatchEvent(new CustomEvent('langchange', { detail: { lang: lang } }));
  }

  function init() {
    applyLang(getSaved());
  }

  document.addEventListener('DOMContentLoaded', init);

  /* Ensure touch/click events on lang-btn are caught globally */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.lang-btn');
    if (btn && btn.dataset.lang) {
      applyLang(btn.dataset.lang);
    }
  });

  global.I18n = { t: t, apply: applyLang, current: getSaved, langs: LANGS };
}(window));
