package app.closer.phone;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.*;
import android.provider.Settings;
import android.view.*;
import android.widget.*;
import org.json.*;
import java.util.concurrent.*;

public class MainActivity extends Activity {
 private final int INK=Color.rgb(23,33,44),BLUE=Color.rgb(37,99,235),MUTED=Color.rgb(99,112,128),BG=Color.rgb(248,249,251);
 private LinearLayout content,topApps;private TextView status,permissionStatus,screenValue,unlocksValue,currentName,lastSync;private ImageView currentIcon;
 private EditText server,code;private Button pair,share;private final Handler handler=new Handler(Looper.getMainLooper());private final ExecutorService io=Executors.newSingleThreadExecutor();private boolean paired;private long shownCapture=-1;
 private android.content.SharedPreferences prefs(){return getSharedPreferences("closer",MODE_PRIVATE);}
 private int dp(int n){return (int)(getResources().getDisplayMetrics().density*n+.5f);}
 protected void onCreate(Bundle b){super.onCreate(b);if(!SharingService.active)prefs().edit().putBoolean("running",false).apply();render();}
 protected void onResume(){super.onResume();refresh.run();}
 protected void onPause(){handler.removeCallbacks(refresh);super.onPause();}
 protected void onDestroy(){io.shutdownNow();super.onDestroy();}
 private GradientDrawable background(int color,int radius,boolean border){GradientDrawable d=new GradientDrawable();d.setColor(color);d.setCornerRadius(dp(radius));if(border)d.setStroke(dp(1),Color.rgb(231,234,239));return d;}
 private TextView text(LinearLayout parent,String value,int size,int color){TextView t=new TextView(this);t.setText(value);t.setTextSize(size);t.setTextColor(color);t.setLineSpacing(dp(3),1);parent.addView(t,new LinearLayout.LayoutParams(-1,-2));return t;}
 private void gap(LinearLayout p,int n){p.addView(new Space(this),new LinearLayout.LayoutParams(1,dp(n)));}
 private LinearLayout card(){LinearLayout c=new LinearLayout(this);c.setOrientation(1);c.setPadding(dp(20),dp(20),dp(20),dp(20));c.setBackground(background(Color.WHITE,12,true));LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,-2);lp.bottomMargin=dp(16);content.addView(c,lp);return c;}
 private Button button(LinearLayout p,String value,boolean primary,View.OnClickListener action){Button b=new Button(this);b.setText(value);b.setAllCaps(false);b.setTextSize(14);b.setTextColor(primary?Color.WHITE:INK);b.setBackground(background(primary?BLUE:Color.WHITE,8,!primary));LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,dp(48));lp.topMargin=dp(12);p.addView(b,lp);b.setOnClickListener(action);int icon=value.contains("Pause")?R.drawable.lucide_pause:value.contains("Start")?R.drawable.lucide_play:value.contains("share")?R.drawable.lucide_share:value.contains("settings")?R.drawable.lucide_settings:value.contains("About")?R.drawable.lucide_shield:value.contains("Disconnect")?R.drawable.lucide_disconnect:R.drawable.lucide_link;buttonIcon(b,icon,primary);return b;}
 private EditText input(LinearLayout p,String label,String hint){gap(p,18);text(p,label,12,MUTED);EditText e=new EditText(this);e.setTextSize(14);e.setSingleLine(true);e.setTextColor(INK);e.setHintTextColor(Color.rgb(149,160,175));e.setPadding(dp(12),dp(12),dp(12),dp(12));e.setBackground(background(Color.WHITE,7,true));e.setHint(hint);e.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO);LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,dp(48));lp.topMargin=dp(8);p.addView(e,lp);return e;}
 private void buttonIcon(Button button,int resource,boolean primary){android.graphics.drawable.Drawable icon=getDrawable(resource).mutate();icon.setTint(primary?Color.WHITE:MUTED);icon.setBounds(0,0,dp(17),dp(17));button.setCompoundDrawables(icon,null,null,null);button.setCompoundDrawablePadding(dp(9));button.setPadding(dp(14),0,dp(14),0);}
 private TextView metric(LinearLayout row,String label){LinearLayout col=new LinearLayout(this);col.setOrientation(1);row.addView(col,new LinearLayout.LayoutParams(0,-2,1));text(col,label,12,MUTED);gap(col,10);return text(col,"—",30,INK);}
 private String time(long ms){long m=ms/60000;return m>=60?m/60+"h "+m%60+"m":m+"m";}
 private void render(){
  paired=!prefs().getString("writer","").isEmpty();shownCapture=-1;
  ScrollView scroll=new ScrollView(this);scroll.setFillViewport(true);scroll.setBackgroundColor(BG);
  content=new LinearLayout(this);content.setOrientation(1);content.setPadding(dp(22),dp(28),dp(22),dp(24));scroll.addView(content);setContentView(scroll);
  content.setOnApplyWindowInsetsListener((v,insets)->{int top,bottom;if(Build.VERSION.SDK_INT>=30){android.graphics.Insets bars=insets.getInsets(WindowInsets.Type.systemBars());top=bars.top;bottom=bars.bottom;}else{top=insets.getSystemWindowInsetTop();bottom=insets.getSystemWindowInsetBottom();}v.setPadding(dp(22),dp(24)+top,dp(22),dp(24)+bottom);return insets;});
  TextView logo=text(content,"closer",23,INK);logo.setTypeface(null,Typeface.BOLD);gap(content,30);
  text(content,paired?"Phone activity":"Connect your phone",27,INK).setTypeface(null,Typeface.BOLD);gap(content,8);
  text(content,paired?prefs().getString("name","My phone"):"Share your Android activity privately.",14,MUTED);gap(content,25);
  if(!paired){
   LinearLayout setup=card();text(setup,"Pair with your dashboard",16,INK);gap(setup,8);text(setup,"Create a pairing code in the web dashboard, then enter it here.",13,MUTED);
   server=input(setup,"Server URL","https://closer.example.com");server.setInputType(android.text.InputType.TYPE_CLASS_TEXT|android.text.InputType.TYPE_TEXT_VARIATION_URI);server.setText(prefs().getString("draftServer",""));
   code=input(setup,"Pairing code","XXXX-XXXX-XXXX-XXXX-XXXX");code.setInputType(android.text.InputType.TYPE_CLASS_TEXT|android.text.InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS);gap(setup,8);pair=button(setup,"Connect phone",true,v->pair());
  }else{
   LinearLayout live=card();text(live,"SHARING",10,MUTED).setLetterSpacing(.10f);gap(live,8);status=text(live,"Ready to share",16,INK);
   LinearLayout current=new LinearLayout(this);current.setGravity(Gravity.CENTER_VERTICAL);LinearLayout.LayoutParams currentLp=new LinearLayout.LayoutParams(-1,-2);currentLp.topMargin=dp(22);live.addView(current,currentLp);
   currentIcon=new ImageView(this);currentIcon.setScaleType(ImageView.ScaleType.FIT_CENTER);current.addView(currentIcon,new LinearLayout.LayoutParams(dp(42),dp(42)));
   LinearLayout currentCopy=new LinearLayout(this);currentCopy.setOrientation(1);LinearLayout.LayoutParams copyLp=new LinearLayout.LayoutParams(0,-2,1);copyLp.leftMargin=dp(13);current.addView(currentCopy,copyLp);text(currentCopy,"Current app",11,MUTED);gap(currentCopy,4);currentName=text(currentCopy,"Not sharing",16,INK);
   gap(live,10);share=button(live,"Start sharing",true,v->toggle());
   LinearLayout totals=card();text(totals,"TODAY",10,MUTED).setLetterSpacing(.10f);gap(totals,18);LinearLayout metrics=new LinearLayout(this);totals.addView(metrics);screenValue=metric(metrics,"Screen time");unlocksValue=metric(metrics,"Unlocks");
   LinearLayout apps=card();text(apps,"App usage",16,INK);gap(apps,16);topApps=new LinearLayout(this);topApps.setOrientation(1);apps.addView(topApps);lastSync=text(content,"",11,MUTED);gap(content,6);
   button(content,"Create & share viewing link",false,v->shareLink());gap(content,7);text(content,"Creating a new link revokes the previous one.",11,MUTED);gap(content,20);
  }
  LinearLayout permissions=card();text(permissions,"Usage access",15,INK);gap(permissions,7);permissionStatus=text(permissions,"",12,MUTED);button(permissions,"Open usage settings",false,v->startActivity(new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS,Uri.parse("package:"+getPackageName()))));
  if(paired){text(content,prefs().getString("server",""),11,MUTED);gap(content,8);Button remove=button(content,"Disconnect & delete data",false,v->new AlertDialog.Builder(this).setTitle("Disconnect phone?").setMessage("This permanently deletes shared history and revokes the viewing link.").setNegativeButton("Cancel",null).setPositiveButton("Delete & disconnect",(d,w)->disconnect()).show());remove.setTextColor(Color.rgb(180,60,60));}
  button(content,"About sharing",false,v->new AlertDialog.Builder(this).setTitle("Private activity sharing").setMessage("Shares app names and icons, screen time, unlock counts and battery. No messages, screenshots, browsing content or location.\n\nSharing uses a visible notification with a Pause action. Reopen Closer to resume after restarting your phone.\n\nOn resume, daily totals include time while sharing was paused.\n\nUse your self-hosted HTTPS server URL. The private Sites preview cannot receive background phone uploads.").setPositiveButton("OK",null).show());
  update();
  if(android.animation.ValueAnimator.areAnimatorsEnabled())for(int i=0;i<content.getChildCount();i++){View child=content.getChildAt(i);if(child instanceof LinearLayout){child.setAlpha(0f);child.setTranslationY(dp(7));child.animate().alpha(1f).translationY(0f).setDuration(220).setStartDelay(Math.min(i*18,140)).start();}}
 }
 private void pair(){try{final String base=ApiClient.normalize(server.getText().toString()),pairCode=code.getText().toString().trim();if(pairCode.isEmpty())throw new Exception("Enter the pairing code from your dashboard");prefs().edit().putString("draftServer",base).apply();pair.setEnabled(false);io.execute(()->{try{JSONObject r=ApiClient.post(base,"/api/pairings/redeem","",new JSONObject().put("code",pairCode));prefs().edit().putString("name",r.optString("name","My phone")).putString("server",base).putString("device",r.getString("deviceId")).putString("writer",r.getString("writerToken")).putString("viewer",r.getString("viewerToken")).putString("status","Ready to share").apply();handler.post(this::render);}catch(Exception e){handler.post(()->{pair.setEnabled(true);message(e.getMessage());});}});}catch(Exception e){message(e.getMessage());}}
 private void toggle(){if(prefs().getBoolean("running",false)){startService(new Intent(this,SharingService.class).setAction(SharingService.PAUSE));return;}if(!UsageCollector.permitted(this)){message("Enable Closer in Usage access settings first.");return;}if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED){requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},1);return;}startForegroundService(new Intent(this,SharingService.class));prefs().edit().putBoolean("running",true).apply();update();}
 public void onRequestPermissionsResult(int code,String[] permissions,int[] results){super.onRequestPermissionsResult(code,permissions,results);if(code==1&&results.length>0&&results[0]==PackageManager.PERMISSION_GRANTED)toggle();else message("Enable notifications to keep activity sharing visible and easy to pause.");}
 private void shareLink(){io.execute(()->{try{JSONObject r=ApiClient.post(prefs().getString("server",""),"/api/devices/"+prefs().getString("device","")+"/viewer",prefs().getString("writer",""),new JSONObject());String viewer=r.getString("viewerToken");prefs().edit().putString("viewer",viewer).apply();String link=prefs().getString("server","")+"/#device="+prefs().getString("device","")+"&view="+viewer;handler.post(()->{Intent send=new Intent(Intent.ACTION_SEND);send.setType("text/plain");send.putExtra(Intent.EXTRA_TEXT,"My phone activity\n"+link);startActivity(Intent.createChooser(send,"Share your private dashboard"));});}catch(Exception e){handler.post(()->message(e.getMessage()));}});}
 private void disconnect(){stopService(new Intent(this,SharingService.class));io.execute(()->{try{java.net.HttpURLConnection c=(java.net.HttpURLConnection)new java.net.URL(prefs().getString("server","")+"/api/devices/"+prefs().getString("device","")).openConnection();c.setConnectTimeout(10000);c.setReadTimeout(10000);c.setInstanceFollowRedirects(false);c.setRequestMethod("DELETE");c.setRequestProperty("Authorization","Bearer "+prefs().getString("writer",""));int code=c.getResponseCode();c.disconnect();if(code!=200&&code!=404)throw new Exception("Could not delete server data. Try again when connected.");prefs().edit().clear().apply();handler.post(this::render);}catch(Exception e){handler.post(()->message(e.getMessage()));}});}
 private void message(String text){new AlertDialog.Builder(this).setTitle("Closer").setMessage(text==null?"Something went wrong. Please retry.":text).setPositiveButton("OK",null).show();}
 private void setIcon(ImageView view,String pkg){try{view.setImageDrawable(getPackageManager().getApplicationIcon(pkg));}catch(Exception ignored){view.setImageResource(app.closer.phone.R.drawable.ic_closer);}}
 private void update(){
  if(permissionStatus==null)return;boolean allowed=UsageCollector.permitted(this);permissionStatus.setText(allowed?"Enabled":"Required to read app activity and screen time");permissionStatus.setTextColor(allowed?BLUE:MUTED);
  if(!paired||status==null)return;boolean running=prefs().getBoolean("running",false);String state=prefs().getString("status","Ready to share");status.setText(!running&&SharingService.active?"Pausing…":!running?(state.startsWith("Paused on phone")?state:"Sharing paused"):state.startsWith("Connected")?"Sharing is on":state);share.setText(running?"Pause sharing":"Start sharing");buttonIcon(share,running?R.drawable.lucide_pause:R.drawable.lucide_play,true);
  try{
   JSONObject snapshot=new JSONObject(prefs().getString("snapshot","{}"));boolean hasData=snapshot.has("capturedAt");screenValue.setText(hasData?time(snapshot.optLong("screenTimeMs")):"—");unlocksValue.setText(hasData?String.valueOf(snapshot.optInt("unlocks")):"—");
   JSONObject current=snapshot.optJSONObject("currentApp");if(running&&System.currentTimeMillis()-snapshot.optLong("capturedAt",0)<30000&&snapshot.optBoolean("screenOn")&&current!=null){currentName.setText(current.optString("name"));currentIcon.setImageTintList(null);setIcon(currentIcon,current.optString("packageName"));}else{currentName.setText(!running?"Not sharing":System.currentTimeMillis()-snapshot.optLong("capturedAt",0)>=30000?"No recent update":"Phone locked");currentIcon.setImageResource(R.drawable.lucide_phone);currentIcon.setImageTintList(android.content.res.ColorStateList.valueOf(MUTED));}
   long synced=prefs().getLong("lastSync",0),seconds=Math.max(0,(System.currentTimeMillis()-synced)/1000);lastSync.setText(synced>0?"Updated "+(seconds<60?seconds+"s":seconds/60+"m")+" ago":"Waiting for the first update");
   if(snapshot.optLong("capturedAt",0)!=shownCapture){shownCapture=snapshot.optLong("capturedAt",0);topApps.removeAllViews();JSONArray apps=snapshot.optJSONArray("apps");if(apps==null||apps.length()==0)text(topApps,"Activity appears after your first sync.",13,MUTED);else for(int i=0;i<Math.min(4,apps.length());i++){
    JSONObject app=apps.getJSONObject(i);LinearLayout row=new LinearLayout(this);row.setGravity(Gravity.CENTER_VERTICAL);LinearLayout.LayoutParams rowLp=new LinearLayout.LayoutParams(-1,dp(48));if(i>0)rowLp.topMargin=dp(7);topApps.addView(row,rowLp);ImageView icon=new ImageView(this);row.addView(icon,new LinearLayout.LayoutParams(dp(32),dp(32)));setIcon(icon,app.getString("packageName"));TextView name=new TextView(this);name.setText(app.getString("name"));name.setTextColor(INK);name.setTextSize(13);name.setMaxLines(1);name.setEllipsize(android.text.TextUtils.TruncateAt.END);LinearLayout.LayoutParams nameLp=new LinearLayout.LayoutParams(0,-2,1);nameLp.leftMargin=dp(12);row.addView(name,nameLp);TextView time=new TextView(this);time.setText(time(app.getLong("durationMs")));time.setTextSize(12);time.setTextColor(MUTED);row.addView(time);
   }}
  }catch(Exception ignored){lastSync.setText("Waiting for the first update");}
 }
 private final Runnable refresh=new Runnable(){public void run(){update();handler.postDelayed(this,2000);}};
}
