import * as React from 'react';

const MOBILE_BREAKPOINT = 768;

export function useIsMobile(query = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`) {
  const [isMobile, setIsMobile] = React.useState(
    () => window.matchMedia(query).matches,
  );

  React.useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => {
      setIsMobile(mql.matches);
    };
    mql.addEventListener('change', onChange);
    onChange();
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return !!isMobile;
}
