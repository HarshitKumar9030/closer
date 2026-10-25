import app.closer.phone.UsageAccumulator;
import java.time.*;
import java.util.*;
public class UsageAccumulatorTest {
 static UsageAccumulator.Event e(long t,int type,String pkg){return new UsageAccumulator.Event(t,type,pkg);}
 static void check(boolean b,String message){if(!b)throw new AssertionError(message);}
 public static void main(String[] args){
  ZoneId zone=ZoneId.of("UTC");long start=Instant.parse("2026-10-25T00:00:00Z").toEpochMilli();
  List<UsageAccumulator.Event> events=Arrays.asList(e(start-10000,15,null),e(start-9000,18,null),e(start-8000,1,"app.one"),e(start+60000,2,"app.one"),e(start+60000,1,"app.two"),e(start+120000,17,null),e(start+121000,16,null),e(start+180000,15,null),e(start+185000,18,null),e(start+186000,1,"app.one"));
  var r=UsageAccumulator.compute(events,start,start+240000,zone,true,false);
  check(r.screenTimeMs==175000,"Screen time must exclude lock-screen and screen-off time");check(r.unlocks==1,"Yesterday's unlock must not count today");check(r.apps.get("app.one")==114000,"App one total");check(r.apps.get("app.two")==61000,"App two total");check(r.hourly[0]==175000,"Hourly totals must match");check("app.one".equals(r.currentPackage),"Current foreground app");
  var off=UsageAccumulator.compute(events,start,start+240000,zone,false,true);check(off.currentPackage==null&&!off.screenOn,"No foreground app while locked");
  var duplicates=UsageAccumulator.compute(Arrays.asList(e(start,18,null),e(start+1,18,null)),start,start+1000,zone,true,false);check(duplicates.unlocks==1,"Duplicate unlocks are not double-counted");
  ZoneId ny=ZoneId.of("America/New_York");long dst=LocalDate.of(2026,11,1).atStartOfDay(ny).toInstant().toEpochMilli();var dstResult=UsageAccumulator.compute(Arrays.asList(e(dst,15,null),e(dst,18,null)),dst,dst+25*3600000L,ny,true,false);check(dstResult.screenTimeMs==25*3600000L,"25-hour day supported");check(dstResult.hourly[1]==7200000L,"Repeated DST hour supported");
  System.out.println("Usage reducer: midnight, foreground transitions, locks, unlocks, duplicate events and DST passed.");
 }
}
