// Pure decision for the auto-hiding page header: given the previous hidden
// state and the last/current scroll positions, decide whether the header
// should now be hidden. Hide when scrolling down past a small threshold,
// reveal when scrolling up, and always reveal near the top of the page.
export function shouldHideHeader(
  prevHidden: boolean,
  lastScrollTop: number,
  scrollTop: number,
  threshold = 24
): boolean {
  if (scrollTop <= threshold) return false
  if (scrollTop > lastScrollTop) return true
  if (scrollTop < lastScrollTop) return false
  return prevHidden
}
