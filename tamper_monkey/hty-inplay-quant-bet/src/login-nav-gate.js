/**
 * 登录门禁：自动切场/进场只问这里。
 * deps: { isLoginUiBusy, isLoggedIn }
 */
export function createLoginNavGate(deps) {
  const { isLoginUiBusy, isLoggedIn } = deps;

  function shouldBlockMatchAutoNav() {
    if (isLoginUiBusy()) return true;
    try {
      if (!isLoggedIn()) return true;
    } catch (e) {
      return true;
    }
    return false;
  }

  return { shouldBlockMatchAutoNav };
}
