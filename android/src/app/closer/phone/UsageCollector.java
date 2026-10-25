package app.closer.phone;

import android.app.*;
import android.app.usage.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.os.*;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.util.Base64;
import java.io.ByteArrayOutputStream;
import org.json.*;
import java.time.*;
import java.util.*;

public final class UsageCollector {
 private final Context context;private final ArrayList<UsageAccumulator.Event> cache=new ArrayList<>();
 private final Set<String> seen=new HashSet<>();private final Map<String,String> names=new HashMap<>();private long lastQuery=0,dayStart=0;
 private final Set<String> knownIcons=new HashSet<>();private final LinkedHashMap<String,String> pendingIcons=new LinkedHashMap<>();
 public UsageCollector(Context c){context=c;}
 public static boolean permitted(Context c){AppOpsManager ops=(AppOpsManager)c.getSystemService(Context.APP_OPS_SERVICE);return ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS,android.os.Process.myUid(),c.getPackageName())==AppOpsManager.MODE_ALLOWED;}
 private String label(String pkg){if(names.containsKey(pkg))return names.get(pkg);String value=pkg;try{PackageManager pm=context.getPackageManager();value=pm.getApplicationLabel(pm.getApplicationInfo(pkg,0)).toString();}catch(Exception ignored){value=pkg.substring(pkg.lastIndexOf('.')+1);}if(value.length()>100)value=value.substring(0,100);names.put(pkg,value);return value;}
 private void queueIcon(String pkg){
  if(!knownIcons.add(pkg))return;
  try{Drawable drawable=context.getPackageManager().getApplicationIcon(pkg);Bitmap bitmap=Bitmap.createBitmap(64,64,Bitmap.Config.ARGB_8888);try{Canvas canvas=new Canvas(bitmap);drawable.setBounds(0,0,64,64);drawable.draw(canvas);ByteArrayOutputStream output=new ByteArrayOutputStream();bitmap.compress(Bitmap.CompressFormat.PNG,100,output);String icon="data:image/png;base64,"+Base64.encodeToString(output.toByteArray(),Base64.NO_WRAP);if(icon.length()<=32768)pendingIcons.put(pkg,icon);}finally{bitmap.recycle();}}catch(Exception ignored){/* Package visibility may restrict icon access. The dashboard uses an initial in that case. */}
 }
 public JSONObject pendingIcons()throws JSONException{JSONObject batch=new JSONObject();for(Map.Entry<String,String> entry:pendingIcons.entrySet()){if(batch.length()>=12)break;batch.put(entry.getKey(),entry.getValue());}return batch;}
 public void iconsUploaded(JSONObject batch){Iterator<String> keys=batch.keys();while(keys.hasNext())pendingIcons.remove(keys.next());}
 public JSONObject capture()throws Exception{
  long now=System.currentTimeMillis();ZoneId zone=ZoneId.systemDefault();long start=LocalDate.now(zone).atStartOfDay(zone).toInstant().toEpochMilli();
  if(start!=dayStart){cache.clear();seen.clear();lastQuery=0;dayStart=start;}
  UsageStatsManager manager=(UsageStatsManager)context.getSystemService(Context.USAGE_STATS_SERVICE);
  UsageEvents events=manager.queryEvents(lastQuery==0?start-86400000:Math.max(start-86400000,lastQuery-30000),now);
  if(events==null)throw new Exception("Usage data unavailable. Unlock your phone and check Usage access.");
  UsageEvents.Event e=new UsageEvents.Event();while(events.hasNextEvent()){events.getNextEvent(e);int type=e.getEventType();if(type!=1&&type!=2&&type!=15&&type!=16&&type!=17&&type!=18&&type!=26&&type!=27)continue;
   String k=e.getTimeStamp()+":"+type+":"+e.getPackageName()+":"+e.getClassName();if(seen.add(k))cache.add(new UsageAccumulator.Event(e.getTimeStamp(),type,e.getPackageName()));}
  lastQuery=now;cache.sort(Comparator.comparingLong(ev->ev.time));PowerManager power=(PowerManager)context.getSystemService(Context.POWER_SERVICE);KeyguardManager lock=(KeyguardManager)context.getSystemService(Context.KEYGUARD_SERVICE);
  UsageAccumulator.Result result=UsageAccumulator.compute(cache,start,now,zone,power.isInteractive(),lock.isKeyguardLocked());
  JSONObject out=new JSONObject();out.put("day",LocalDate.now(zone).toString());out.put("capturedAt",now);out.put("timezone",zone.toString());out.put("screenTimeMs",result.screenTimeMs);out.put("unlocks",result.unlocks);out.put("screenOn",result.screenOn);out.put("paused",false);
  BatteryManager battery=(BatteryManager)context.getSystemService(Context.BATTERY_SERVICE);int level=battery.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY);out.put("battery",level>=0&&level<=100?level:JSONObject.NULL);
  JSONArray hourly=new JSONArray();for(long value:result.hourly)hourly.put(value);out.put("hourly",hourly);
  JSONArray apps=new JSONArray();ArrayList<Map.Entry<String,Long>> entries=new ArrayList<>(result.apps.entrySet());entries.sort((a,b)->Long.compare(b.getValue(),a.getValue()));for(Map.Entry<String,Long> a:entries){if(apps.length()>=300)break;JSONObject item=new JSONObject();item.put("packageName",a.getKey());item.put("name",label(a.getKey()));item.put("durationMs",a.getValue());apps.put(item);queueIcon(a.getKey());}out.put("apps",apps);
  if(result.currentPackage!=null){JSONObject current=new JSONObject();current.put("packageName",result.currentPackage);current.put("name",label(result.currentPackage));queueIcon(result.currentPackage);out.put("currentApp",current);}else out.put("currentApp",JSONObject.NULL);return out;
 }
}
