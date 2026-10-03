// Conch's Blessing site texts (UI only; item text comes from items.js).

const texts = {
    en: {
        pageTitle: "Conch's Blessing - Item Codex",
        subtitle: "Item Codex",
        workshop: "Steam Workshop",
        languageLabel: "Language",
        autoDetect: "Auto ({lang})",
        introText: "When the Magic Conch answers, matching item pedestals in the room transform into the item for that answer.",
        required: "Requires",

        searchPlaceholder: "Search names, effects, or origin items",
        clearSearch: "Clear search",
        allFlags: "All",
        positive: "Positive",
        neutral: "Neutral",
        negative: "Negative",
        passive: "Passive",
        active: "Active",
        familiar: "Familiar",
        trinket: "Trinket",
        groupCollectibles: "Collectibles",
        groupFamiliars: "Familiars",
        groupTrinkets: "Trinkets",
        groupWip: "Work in progress",
        itemCount: "{n} items",
        matchCount: "{n} of {total} match",
        noMatch: "No items match. Try another search.",
        hintWide: "Hover an icon to preview it, click to pin it.",

        wip: "Work in progress",
        wipText: "This item is still being made.",
        effects: "Effects",
        upgrade: "Magic Conch upgrade",
        answer: "{flag} answer",
        evolvesFrom: "Evolves from",
        evolvesInto: "Evolves into",
        synergies: "Synergies",
        synergyFilter: "Filter synergies",
        noSynergyMatch: "No synergies match.",
        details: "Details",
        pools: "Item pools",
        tags: "Tags",
        shopPrice: "Shop price",
        devilPrice: "Devil deal",
        charges: "Charges",
        close: "Close",
        copyLink: "Copy link",
        linkCopied: "Link copied",
        flagDesc_positive: "Appears when the Magic Conch gives a positive answer.",
        flagDesc_neutral: "Appears when the Magic Conch gives a neutral answer.",
        flagDesc_negative: "Appears when the Magic Conch gives a negative answer.",
        footer: "Conch's Blessing is a fan-made mod for The Binding of Isaac: Repentance."
    },

    kr: {
        pageTitle: "소라고둥의 축복 - 아이템 도감",
        subtitle: "아이템 도감",
        workshop: "스팀 창작마당",
        languageLabel: "언어",
        autoDetect: "자동 ({lang})",
        introText: "마법의 소라고둥이 대답하면, 방 안의 해당 받침대 아이템이 그 대답에 맞는 아이템으로 바뀝니다.",
        required: "필수 모드",

        searchPlaceholder: "이름, 효과, 원본 아이템으로 검색",
        clearSearch: "검색어 지우기",
        allFlags: "전체",
        positive: "긍정",
        neutral: "중립",
        negative: "부정",
        passive: "패시브",
        active: "액티브",
        familiar: "패밀리어",
        trinket: "장신구",
        groupCollectibles: "아이템",
        groupFamiliars: "패밀리어",
        groupTrinkets: "장신구",
        groupWip: "작업 중",
        itemCount: "아이템 {n}개",
        matchCount: "{total}개 중 {n}개 일치",
        noMatch: "일치하는 아이템이 없습니다. 다른 검색어를 써 보세요.",
        hintWide: "아이콘에 마우스를 올리면 미리 보고, 누르면 고정됩니다.",

        wip: "작업 중",
        wipText: "아직 만들고 있는 아이템입니다.",
        effects: "효과",
        upgrade: "소라고둥 강화",
        answer: "{flag} 대답",
        evolvesFrom: "진화 전",
        evolvesInto: "진화",
        synergies: "시너지",
        synergyFilter: "시너지 검색",
        noSynergyMatch: "일치하는 시너지가 없습니다.",
        details: "정보",
        pools: "등장 위치",
        tags: "태그",
        shopPrice: "상점 가격",
        devilPrice: "악마 거래",
        charges: "충전량",
        close: "닫기",
        copyLink: "링크 복사",
        linkCopied: "링크를 복사했습니다",
        flagDesc_positive: "마법의 소라고둥이 긍정으로 대답하면 나타납니다.",
        flagDesc_neutral: "마법의 소라고둥이 중립으로 대답하면 나타납니다.",
        flagDesc_negative: "마법의 소라고둥이 부정으로 대답하면 나타납니다.",
        footer: "Conch's Blessing은 The Binding of Isaac: Repentance 팬 제작 모드입니다."
    }
};

// 브라우저는 한국어를 ko / ko-KR로 알려 주지만 이 사이트의 언어 키는 kr이다.
const BROWSER_LANGUAGE_ALIASES = { ko: 'kr' };

function detectAndSetLanguage() {
    // 선호 언어 목록을 순서대로 보고 지원하는 첫 언어를 고른다.
    const preferred = (navigator.languages && navigator.languages.length)
        ? navigator.languages
        : [navigator.language || navigator.userLanguage || 'en'];
    for (const tag of preferred) {
        const code = String(tag).split('-')[0].toLowerCase();
        const lang = BROWSER_LANGUAGE_ALIASES[code] || code;
        if (texts[lang]) {
            return lang;
        }
    }
    return 'en'; // 기본값은 영어
}

// 텍스트 가져오기; {n} 같은 자리표시는 vars로 채운다.
function getText(key, language, vars) {
    let text = texts[language || 'en']?.[key] ?? texts.en[key] ?? key;
    if (vars) {
        for (const [name, value] of Object.entries(vars)) {
            text = text.split(`{${name}}`).join(value);
        }
    }
    return text;
}
