package app.closer.phone;

import java.time.*;
import java.util.*;

/** Android-free reducer, tested with synthetic usage events. Counts unlocked interactive time. */
public final class UsageAccumulator {
 public static final class Event {
  public final long time; public final int type; public final String pkg;
  public Event(long time,int type,String pkg){this.time=time;this.type=type;this.pkg=pkg;}
 }
 public static final class Result {
  public long screenTimeMs; public int unlocks; public long[] hourly=new long[24];
  public Map<String,Long> apps=new HashMap<>(); public String currentPackage; public boolean screenOn;
 }
 public static Result compute(List<Event> events,long dayStart,long now,ZoneId zone,boolean interactive,boolean keyguardLocked) {
  Result r=new Result();boolean on=false,unlocked=false;String pkg=null;long previous=dayStart;
  for(Event e:events){if(e.time>now)break;
   if(e.time>=dayStart){add(r,previous,e.time,on&&unlocked,pkg,zone);previous=e.time;}
   switch(e.type){
    case 1: pkg=e.pkg;break; // ACTIVITY_RESUMED
    case 2: if(Objects.equals(pkg,e.pkg))pkg=null;break; // ACTIVITY_PAUSED
    case 15:on=true;break; // SCREEN_INTERACTIVE
    case 16:on=false;unlocked=false;break;
    case 17:unlocked=false;break;
    case 18:if(e.time>=dayStart&&!unlocked)r.unlocks++;unlocked=true;on=true;break;
    case 26:case 27:on=false;unlocked=false;pkg=null;break;
    default:break;
   }
  }
  add(r,previous,now,on&&unlocked,pkg,zone);
  r.screenOn=interactive&&!keyguardLocked;r.currentPackage=r.screenOn?pkg:null;return r;
 }
 private static void add(Result r,long start,long end,boolean active,String pkg,ZoneId zone){
  if(!active||end<=start)return;long span=end-start;r.screenTimeMs+=span;
  if(pkg!=null)r.apps.put(pkg,r.apps.getOrDefault(pkg,0L)+span);
  while(start<end){ZonedDateTime dt=Instant.ofEpochMilli(start).atZone(zone);long next=dt.withMinute(0).withSecond(0).withNano(0).plusHours(1).toInstant().toEpochMilli();long to=Math.min(end,next);r.hourly[dt.getHour()]+=to-start;start=to;}
 }
}
