package app.closer.phone;

import android.app.*;
import android.content.*;
import android.content.pm.ServiceInfo;
import android.os.*;
import org.json.*;
import java.util.concurrent.*;

public class SharingService extends Service {
 public static volatile boolean active=false;
 public static final String PAUSE="app.closer.PAUSE";
 private ScheduledExecutorService executor;private UsageCollector collector;private volatile boolean stopping=false;private boolean resumed=false;
 private android.content.SharedPreferences prefs(){return getSharedPreferences("closer",MODE_PRIVATE);}
 public void onCreate(){super.onCreate();active=true;collector=new UsageCollector(this);executor=Executors.newSingleThreadScheduledExecutor();NotificationManager nm=getSystemService(NotificationManager.class);nm.createNotificationChannel(new NotificationChannel("sharing","Activity sharing",NotificationManager.IMPORTANCE_LOW));}
 public int onStartCommand(Intent intent,int flags,int id){
  if(intent!=null&&PAUSE.equals(intent.getAction())){pause();return START_NOT_STICKY;}
  if(prefs().getString("writer","").isEmpty()||!UsageCollector.permitted(this)){stopSelf();return START_NOT_STICKY;}
  Notification n=notification("Connecting your shared space…");if(Build.VERSION.SDK_INT>=34)startForeground(1,n,ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);else startForeground(1,n);
  if(!prefs().getBoolean("running",false)||executor.isShutdown()){prefs().edit().putBoolean("running",true).putString("status","Connecting…").apply();}
  if(!resumed){resumed=true;executor.scheduleWithFixedDelay(this::sync,0,5,TimeUnit.SECONDS);}return START_NOT_STICKY;
 }
 private Notification notification(String text){PendingIntent open=PendingIntent.getActivity(this,0,new Intent(this,MainActivity.class),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);PendingIntent pause=PendingIntent.getService(this,1,new Intent(this,SharingService.class).setAction(PAUSE),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
  return new Notification.Builder(this,"sharing").setSmallIcon(app.closer.phone.R.drawable.ic_notification).setContentTitle("Closer · sharing is on").setContentText(text).setContentIntent(open).setOngoing(true).addAction(new Notification.Action.Builder(null,"Pause sharing",pause).build()).build();}
 private JSONObject post(String suffix,JSONObject data)throws Exception{return ApiClient.post(prefs().getString("server",""),"/api/devices/"+prefs().getString("device","")+suffix,prefs().getString("writer",""),data);}
 private boolean first=true;
 private void sync(){if(stopping)return;try{
  if(!UsageCollector.permitted(this))throw new SecurityException("Usage access was removed. Enable it and resume sharing.");
  // Only an explicit user start may clear a server-side pause.
  if(first){post("/sharing",new JSONObject().put("paused",false));first=false;}
  JSONObject snapshot=collector.capture();if(stopping)return;JSONObject response=post("/snapshot",snapshot);
  if(response.optBoolean("paused")){stopping=true;prefs().edit().putBoolean("running",false).putString("status","Sharing paused from your dashboard").apply();stopSelf();return;}
  try{JSONObject icons=collector.pendingIcons();if(!stopping&&icons.length()>0){post("/icons",new JSONObject().put("icons",icons));collector.iconsUploaded(icons);}}catch(Exception ignored){/* Retry optional icons next sync without interrupting usage sharing. */}
  prefs().edit().putLong("lastSync",System.currentTimeMillis()).putString("snapshot",snapshot.toString()).putString("status","Connected · updates about every 5 seconds").apply();getSystemService(NotificationManager.class).notify(1,notification("App names, screen time and unlocks are being shared. Tap Pause anytime."));
 }catch(Exception e){prefs().edit().putString("status",e.getMessage()==null?"Unable to sync. Retrying…":e.getMessage()).apply();getSystemService(NotificationManager.class).notify(1,notification("Sync interrupted. Retrying while sharing is on."));if(e instanceof SecurityException){stopping=true;prefs().edit().putBoolean("running",false).apply();stopSelf();}}}
 private void pause(){stopping=true;prefs().edit().putBoolean("running",false).putString("status","Sharing paused · your space, your choice").apply();executor.execute(()->{try{post("/sharing",new JSONObject().put("paused",true));}catch(Exception e){prefs().edit().putString("status","Paused on phone. Server unreachable; dashboard will show offline.").apply();}finally{stopSelf();}});}
 public void onDestroy(){stopping=true;active=false;prefs().edit().putBoolean("running",false).apply();executor.shutdownNow();stopForeground(STOP_FOREGROUND_REMOVE);super.onDestroy();}
 public IBinder onBind(Intent i){return null;}
}
