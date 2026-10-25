package app.closer.phone.tests;

import android.app.Instrumentation;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Bundle;
import android.util.Base64;
import org.json.JSONObject;
import java.lang.reflect.Method;

/** Exercises real PackageManager drawable extraction without granting Usage Access. */
public class IconInstrumentation extends Instrumentation {
 public void onCreate(Bundle args){super.onCreate(args);start();}
 public void onStart(){Bundle result=new Bundle();try{
  Context context=getTargetContext();Class<?> type=context.getClassLoader().loadClass("app.closer.phone.UsageCollector");
  Object collector=type.getConstructor(Context.class).newInstance(context);Method queue=type.getDeclaredMethod("queueIcon",String.class);queue.setAccessible(true);
  queue.invoke(collector,context.getPackageName());JSONObject batch=(JSONObject)type.getMethod("pendingIcons").invoke(collector);
  String icon=batch.getString(context.getPackageName());if(!icon.startsWith("data:image/png;base64,"))throw new AssertionError("Expected PNG data URL");
  byte[] bytes=Base64.decode(icon.substring(22),Base64.NO_WRAP);Bitmap bitmap=BitmapFactory.decodeByteArray(bytes,0,bytes.length);
  if(bitmap==null||bitmap.getWidth()!=64||bitmap.getHeight()!=64)throw new AssertionError("Expected decodable 64x64 icon");bitmap.recycle();
  type.getMethod("iconsUploaded",JSONObject.class).invoke(collector,batch);if(((JSONObject)type.getMethod("pendingIcons").invoke(collector)).length()!=0)throw new AssertionError("Uploaded icons must leave the queue");
  queue.invoke(collector,context.getPackageName());if(((JSONObject)type.getMethod("pendingIcons").invoke(collector)).length()!=0)throw new AssertionError("Icons must not be uploaded every sync");
  result.putString("iconTest","passed: real installed drawable -> 64x64 PNG -> upload queue -> acknowledgement");finish(-1,result);
 }catch(Throwable error){result.putString("iconTest","failed: "+error.toString());finish(1,result);}}
}
