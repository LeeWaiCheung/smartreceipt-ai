/** Next's request URL may use localhost internally even for a 127.0.0.1 Host. */
export function isSameOrigin(request:Request):boolean {
  const origin=request.headers.get("origin");
  if(!origin)return true;
  try {
    const url=new URL(request.url),host=request.headers.get("host")||url.host;
    const expected=new URL(url.protocol+"//"+host);
    // The browser cannot set Host. Do not accept a client-supplied forwarded host.
    return !expected.username&&!expected.password&&expected.host===host.toLowerCase()&&origin===expected.origin;
  } catch {return false;}
}
