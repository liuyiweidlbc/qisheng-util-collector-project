/**
 * 选场纯逻辑工厂。deps 提供列表/缓存/门禁相关能力。
 */
export function createNavPicker(deps) {
  const {
    getNavigableInPlayMatches,
    getMatchRuleMeetCount,
    matchHasNavigablePendingWork,
    isUserManualMatchActive,
    shouldHoldCurrentMatch,
    isCurrentMatchEnded,
    parseKickoffMs,
    KICKOFF_NAV_PRIORITY_MS,
    getMatchId,
    saveRotateIndex,
  } = deps;

  function pickRuleMeetNavigableMatch(excludeId, sourceList) {
    const ex = excludeId ? String(excludeId) : '';
    const cur = getMatchId() ? String(getMatchId()) : '';
    const candidates = getNavigableInPlayMatches(sourceList).filter(function (item) {
      const id = String(item.matchId);
      if (ex && id === ex) return false;
      return getMatchRuleMeetCount(item) > 0;
    });
    if (!candidates.length) return '';

    const pool = cur
      ? candidates.filter(function (item) {
          return String(item.matchId) !== cur;
        })
      : candidates;
    const ranked = (pool.length ? pool : candidates).slice().sort(function (a, b) {
      const diff = getMatchRuleMeetCount(b) - getMatchRuleMeetCount(a);
      if (diff !== 0) return diff;
      const ka = parseKickoffMs(a.kickoffTime) || 0;
      const kb = parseKickoffMs(b.kickoffTime) || 0;
      if (ka !== kb) return ka - kb;
      return String(a.matchId).localeCompare(String(b.matchId));
    });

    const bestId = String(ranked[0].matchId);
    if (bestId !== cur) return bestId;
    return '';
  }

  function pickPreferredNavigableMatch(excludeId, currentId, sourceList) {
    const list = sourceList;
    const matchId = getMatchId();
    const cur = currentId != null ? String(currentId) : matchId ? String(matchId) : '';
    let ex = excludeId ? String(excludeId) : '';
    if (!ex && cur && String(cur) === String(matchId) && isCurrentMatchEnded()) {
      ex = cur;
    }
    const now = Date.now();

    const navigable = getNavigableInPlayMatches(list).filter(function (item) {
      const id = String(item.matchId);
      if (ex && id === ex) return false;
      return true;
    });
    if (!navigable.length) return '';

    if (cur && isUserManualMatchActive()) {
      for (let j = 0; j < navigable.length; j++) {
        if (String(navigable[j].matchId) === cur) return cur;
      }
    }

    if (cur && shouldHoldCurrentMatch()) {
      for (let j = 0; j < navigable.length; j++) {
        if (String(navigable[j].matchId) === cur) return cur;
      }
    }

    const ruleMeetId = pickRuleMeetNavigableMatch(ex, list);
    if (ruleMeetId && (!cur || String(ruleMeetId) !== cur)) return ruleMeetId;

    if (cur) {
      const curItem = navigable.find(function (item) {
        return String(item.matchId) === cur;
      });
      if (curItem && matchHasNavigablePendingWork(curItem)) {
        return cur;
      }
    }

    const recentKickoff = navigable
      .filter(function (item) {
        const km = parseKickoffMs(item.kickoffTime);
        return km && now >= km && now - km <= KICKOFF_NAV_PRIORITY_MS;
      })
      .sort(function (a, b) {
        return (parseKickoffMs(b.kickoffTime) || 0) - (parseKickoffMs(a.kickoffTime) || 0);
      });

    for (let i = 0; i < recentKickoff.length; i++) {
      const id = String(recentKickoff[i].matchId);
      if (cur && id === cur) continue;
      return id;
    }

    return String(navigable[0].matchId);
  }

  function pickRotatingInplayMatch(currentId, sourceList) {
    const ids = getNavigableInPlayMatches(sourceList).map(function (item) {
      return String(item.matchId);
    });
    if (!ids.length) return '';
    if (ids.length === 1) return ids[0];

    let pickIdx = 0;
    const cur = currentId ? String(currentId) : '';
    if (cur) {
      const curIdx = ids.indexOf(cur);
      pickIdx = curIdx >= 0 ? (curIdx + 1) % ids.length : 0;
    } else {
      try {
        const saved = parseInt(sessionStorage.getItem('tm_hty_inplay_rotate_index') || '0', 10);
        pickIdx = !isNaN(saved) && saved >= 0 && saved < ids.length ? saved : 0;
      } catch (e) {
        pickIdx = 0;
      }
    }

    const picked = ids[pickIdx];
    if (saveRotateIndex) saveRotateIndex(pickIdx + 1, ids.length);
    return picked;
  }

  function pickNextNavigableMatchId(excludeIds) {
    const ex = {};
    (excludeIds || []).forEach(function (id) {
      if (id != null && id !== '') ex[String(id)] = true;
    });
    const navigable = getNavigableInPlayMatches();
    for (let i = 0; i < navigable.length; i++) {
      const id = String(navigable[i].matchId);
      if (ex[id]) continue;
      return id;
    }
    return '';
  }

  function pickInplayNavigableMatch(excludeId, sourceList) {
    if (excludeId) {
      const next = pickRotatingInplayMatch(excludeId, sourceList);
      if (next && String(next) !== String(excludeId)) return next;
      const ids = getNavigableInPlayMatches(sourceList).map(function (item) {
        return String(item.matchId);
      });
      for (let i = 0; i < ids.length; i++) {
        if (String(ids[i]) !== String(excludeId)) return ids[i];
      }
      return '';
    }
    return pickPreferredNavigableMatch('', getMatchId(), sourceList);
  }

  return {
    pickRuleMeetNavigableMatch,
    pickPreferredNavigableMatch,
    pickRotatingInplayMatch,
    pickNextNavigableMatchId,
    pickInplayNavigableMatch,
  };
}
