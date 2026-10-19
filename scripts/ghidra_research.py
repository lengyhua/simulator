#!/usr/bin/env python3
"""Use Ghidra 12.1 headless (analyzeHeadless) to decompile CalcXRD.exe
and dump the UnitSingle / SFactor-related functions.

Usage:
  python scripts/ghidra_research.py            # run once, writes results
  python scripts/ghidra_research.py --check    # verify install+java first
"""
import os, subprocess, sys

GHIRA_DIR   = r"D:\Programs\ghidra_12.1.4_PUBLIC"
JAVA_HOME   = r"D:\Programs\Java\jdk-21.0.12.1"
JAVA        = os.path.join(JAVA_HOME, "bin", "java.exe")
EXE         = r"D:\Projects\CalcXRD\CalcXRD.exe"
WORKSPACE   = r"D:\Projects\CalcXRD\ghidra-workspace"
OUT_DIR     = r"D:\Projects\CalcXRD\ghidra-out"

def check_prereqs():
    print("== Prerequisite check ==")
    for p in [JAVA, os.path.join(GHIRA_DIR, "support", "analyzeHeadless.bat")]:
        ok = os.path.exists(p)
        print(f"  {p} : {'OK' if ok else 'MISSING'}")
        if not ok:
            print("Missing prerequisite. Aborting."); sys.exit(1)
    # Test java
    r = subprocess.run([JAVA, "-version"], capture_output=True, text=True)
    print("  java -version:", r.stderr.strip().splitlines()[0])

def ensure_workspace():
    if not os.path.exists(WORKSPACE):
        os.makedirs(WORKSPACE)
        print("Created workspace:", WORKSPACE)

def run_ghidra(script_name):
    """Run Ghidra headless import + postScript. script_name is a bare .java or .py basename."""
    ensure_workspace()
    cmd = [
        os.path.join(GHIRA_DIR, "support", "analyzeHeadless.bat"),
        WORKSPACE, "CalcXRD",
        "-import", EXE,
        "-overwrite",
        "-processor", "x86:LE:32:default",
        "-scriptPath", OUT_DIR,
        "-postScript", script_name,
    ]
    print("Running Ghidra headless import...")
    print("  cmd:", " ".join(cmd))
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=300,
                       env={**os.environ, "JAVA_HOME": JAVA_HOME, "PATH": JAVA_HOME+"\bin;"+os.environ.get("PATH","")})
    print("=== Ghidra output (last 40 lines) ===")
    for line in r.stdout.splitlines()[-40:]:
        print("  ", line)
    if r.returncode != 0:
        print("Ghidra import failed:", r.stderr[:500])
    return r.returncode

if __name__ == "__main__":
    if "--check" in sys.argv:
        check_prereqs()
        sys.exit(0)
    check_prereqs()

    out_dir_win = OUT_DIR.replace("\\", "\\\\")

    # Standard .java script (javac-compilable): extends GhidraScript, imports
    # everything explicitly, uses only methods verified present in Ghidra 12.1.
    #  - println(String)  : GhidraScript public method
    #  - getMonitor()     : FlatProgramAPI public method (GhidraScript's parent)
    #  - DecompileResults.getCCodeMarkup() -> ClangTokenGroup.toString()
    # Java source script — compiled ahead of time to a .jar so Ghidra's
    # JavaScriptProvider loads it via classloader (no javac), bypassing the
    # incomplete headless compile classpath that causes "cannot find symbol".
    java_script = f"""//@category CalcXRD
import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.FunctionIterator;
import java.io.File;
import java.io.PrintStream;
import java.io.PrintWriter;

public class DumpAllFuncs extends GhidraScript {{
  public void run() throws Exception {{
    File dir = new File("{out_dir_win}", "funcs");
    if (!dir.exists()) dir.mkdirs();
    DecompInterface di = new DecompInterface();
    di.openProgram(currentProgram);
    di.toggleCCode(true);
    int total = 0, ok = 0;
    PrintStream out = new PrintStream(new File(dir, "progress.log"), "UTF-8");
    for (FunctionIterator it = currentProgram.getFunctionManager().getFunctions(true); it.hasNext();) {{
      Function f = it.next();
      total++;
      String name = f.getName();
      StringBuilder sb = new StringBuilder();
      for (char c : name.toCharArray()) {{
        if (Character.isLetterOrDigit(c) || c == '_' || c == '.' || c == '-') sb.append(c);
        else sb.append('_');
      }}
      name = sb.toString();
      DecompileResults dr = di.decompileFunction(f, 30, null);
      boolean valid = (dr != null) && dr.isValid() && !dr.isTimedOut();
      String txt = null;
      if (valid && dr.getCCodeMarkup() != null) {{
        txt = dr.getCCodeMarkup().toString();
      }}
      if (valid && txt != null && !txt.trim().isEmpty()) {{
        try (PrintWriter pw = new PrintWriter(new File(dir, name + ".txt"), "UTF-8")) {{
          pw.println("// " + f.getEntryPoint() + "  " + f.getName() + "  (" + f.getBody() + ")");
          pw.println(txt);
        }}
        ok++;
        out.println(f.getName() + " decompiled");
      }} else {{
        String err = (dr == null) ? "null" : dr.getErrorMessage();
        out.println("FAIL " + f.getName() + " @ " + f.getEntryPoint() + " err=" + err);
      }}
    }}
    out.println("done: " + ok + "/" + total + " functions decompiled to " + dir);
    out.flush();
    di.dispose();
  }}
}}
"""
    # Write .java source, compile against Ghidra jars, package into .jar
    java_src_path = os.path.join(OUT_DIR, "DumpAllFuncs.src.java")  # renamed: -postScript matches .class uniquely; Ghidra otherwise grabs the .java and recompiles it with its broken classpath
    jar_path = os.path.join(OUT_DIR, "DumpAllFuncs.jar")
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(java_src_path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(java_script)

    # Ghidra 12 JavaScriptProvider: user .java scripts are compiled by an
    # in-house javac that does NOT inherit Ghidra's OSGi bundle classloader —
    # every Ghidra class must be imported explicitly. The @argfile javac
    # pre-compile below confirms the imports resolve before we hand the jar
    # (containing .class only) to analyzeHeadless; that loader chain does
    # resolve classes correctly at runtime.
    # Build Ghidra classpath for javac — include ALL jars anywhere under the
    # install, so every ghidra.* package resolves regardless of lib dir.
    import glob
    jar_files = glob.glob(os.path.join(GHIRA_DIR, "**", "*.jar"), recursive=True)
    classpath = ";".join(jar_files)
    print(f"  classpath jars: {len(jar_files)}")

    # Compile using @argfile to avoid Windows command-line length limits
    javac = os.path.join(JAVA_HOME, "bin", "javac.exe")
    argfile = os.path.join(OUT_DIR, "javac_args.txt")
    with open(argfile, "w") as af:
        af.write(f"-proc:none -encoding UTF-8\n-cp {classpath}\n-d {OUT_DIR}\n{java_src_path}\n")
    compile_cmd = [javac, "@" + argfile]
    print("  compiling via @argfile...")
    rc = subprocess.run(compile_cmd, capture_output=True, text=True,
                        env={**os.environ, "JAVA_HOME": JAVA_HOME})
    if rc.returncode != 0:
        print("javac failed:")
        print(rc.stderr[:2000])
        sys.exit(1)

    # Package .class into a Ghidra-compatible script jar:
    #  - .class file so JavaScriptProvider can load the compiled class
    #  - manifest with Ghidra-Script: True + Main-Class entry
    import zipfile
    jar_path = os.path.join(OUT_DIR, "DumpAllFuncs.jar")
    with zipfile.ZipFile(jar_path, "w") as zf:
        zf.writestr("META-INF/MANIFEST.MF",
                    "Manifest-Version: 1.0\nGhidra-Script: True\n"
                    "Ghidra-Script-Version: 2\nMain-Class: DumpAllFuncs\n")
        zf.write(os.path.join(OUT_DIR, "DumpAllFuncs.class"), "DumpAllFuncs.class")  # jar kept for reference; .class is what -postScript actually uses
    print("  jar written:", jar_path)

    # Ghidra 12 headless checkScript only accepts .class / .java / .py names;
    # a .jar in -scriptPath is rejected. The compiled .class is in -scriptPath
    # (OUT_DIR), so hand that to -postScript — it loads via the OSGi classloader
    # chain, which resolves all Ghidra classes at runtime.
    run_ghidra("DumpAllFuncs.class")
