"""Conservative source-conflict detection. Never infer passage through a footprint."""
def intersection(a, b, c, d):
    x, y, u, v = b[0]-a[0], b[1]-a[1], d[0]-c[0], d[1]-c[1]
    den = x*v-y*u
    if abs(den)<1e-16: return None
    t, s = ((c[0]-a[0])*v-(c[1]-a[1])*u)/den, ((c[0]-a[0])*y-(c[1]-a[1])*x)/den
    return t if 0<=t<=1 and 0<=s<=1 else None

def inside(p, ring):
    result=False
    for a,b in zip(ring,ring[1:]+ring[:1]):
        if (a[1]>p[1])!=(b[1]>p[1]) and p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]: result=not result
    return result

def blocker(a,b,features):
    for f in features:
        g,props=f['geometry'],f['properties']
        if props.get('kind')=='building' and g['type']=='MultiPolygon':
            result=blocker(a,b,[{**f,'geometry':{'type':'Polygon','coordinates':rings}} for rings in g['coordinates']])
            if result: return result
        if props.get('kind')=='building' and g['type']=='Polygon':
            rings=g['coordinates'];outer=rings[0]
            if max(a[0],b[0])<min(p[0] for p in outer) or min(a[0],b[0])>max(p[0] for p in outer) or max(a[1],b[1])<min(p[1] for p in outer) or min(a[1],b[1])>max(p[1] for p in outer): continue
            cuts=[0,1]
            for ring in rings:
                for c,d in zip(ring,ring[1:]):
                    t=intersection(a,b,c,d)
                    if t is not None: cuts.append(t)
            cuts.sort()
            for x,y in zip(cuts,cuts[1:]):
                if y-x<1e-8: continue
                t=(x+y)/2;p=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]
                if inside(p,outer) and not any(inside(p,r) for r in rings[1:]): return 'building:'+props['id']
        elif props.get('kind')=='barrier' and g['type']=='LineString':
            for c,d in zip(g['coordinates'],g['coordinates'][1:]):
                t=intersection(a,b,c,d)
                if t is not None and .001<t<.999:return 'barrier:'+props['id']
    return None
