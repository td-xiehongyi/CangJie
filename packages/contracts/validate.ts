import schema from './schema.json' with {type:'json'};

type Schema = { $ref?:string; oneOf?:Schema[]; type?:string; const?:unknown; enum?:unknown[]; required?:string[]; properties?:Record<string,Schema>; additionalProperties?:boolean|Schema; items?:Schema; minItems?:number; maxItems?:number; minLength?:number; maxLength?:number; pattern?:string; minimum?:number; maximum?:number };
const definitions = schema.$defs as unknown as Record<string,Schema>;
/** Schema v1 structural validation only. Cangjie owns dependencies, budgets and business semantics. */
export function validateContract(name:string,value:unknown): {valid:boolean;issues:{path:string;code:string}[]} {
  const issues:{path:string;code:string}[]=[];
  const check=(s:Schema,v:unknown,path:string,depth:number):void=>{
    const fail=(code:string)=>{issues.push({path,code});};
    if(depth>64){fail('DEPTH_LIMIT');return;}
    if(s.$ref){const target=definitions[s.$ref.split('/').at(-1)!];if(!target)throw new Error('Unknown schema reference');check(target,v,path,depth+1);return;}
    if(s.oneOf){let matches=0;for(const branch of s.oneOf){const n=issues.length;check(branch,v,path,depth+1);if(issues.length===n)matches++;issues.length=n;}if(matches!==1)fail('ONE_OF');return;}
    if(Object.hasOwn(s,'const') && v!==s.const)fail('CONST');
    if(s.enum && !s.enum.includes(v))fail('ENUM');
    if(s.type){const ok=s.type==='object'?v!==null&&typeof v==='object'&&!Array.isArray(v):s.type==='array'?Array.isArray(v):s.type==='integer'?typeof v==='number'&&Number.isSafeInteger(v):s.type==='number'?typeof v==='number'&&Number.isFinite(v):typeof v===s.type;if(!ok){fail('TYPE');return;}}
    if(typeof v==='number'){if(s.minimum!==undefined&&v<s.minimum)fail('MINIMUM');if(s.maximum!==undefined&&v>s.maximum)fail('MAXIMUM');}
    if(typeof v==='string'){if(s.minLength!==undefined&&v.length<s.minLength)fail('MIN_LENGTH');if(s.maxLength!==undefined&&v.length>s.maxLength)fail('MAX_LENGTH');if(s.pattern&&!new RegExp(s.pattern).test(v))fail('PATTERN');}
    if(Array.isArray(v)){if(s.minItems!==undefined&&v.length<s.minItems)fail('MIN_ITEMS');if(s.maxItems!==undefined&&v.length>s.maxItems)fail('MAX_ITEMS');if(s.items)v.forEach((item,i)=>check(s.items!,item,`${path}/${i}`,depth+1));}
    else if(v!==null&&typeof v==='object'){
      const record=v as Record<string,unknown>;for(const key of s.required??[])if(!Object.hasOwn(record,key))issues.push({path:`${path}/${key}`,code:'REQUIRED'});
      for(const [key,item]of Object.entries(record)){const prop=Object.hasOwn(s.properties??{},key)?s.properties![key]:undefined;if(prop)check(prop,item,`${path}/${key}`,depth+1);else if(s.additionalProperties===false)issues.push({path:`${path}/${key}`,code:'ADDITIONAL_PROPERTY'});else if(typeof s.additionalProperties==='object')check(s.additionalProperties,item,`${path}/${key}`,depth+1);}
    }
  };
  const def=definitions[name];if(!def)throw new Error(`Unknown contract: ${name}`);
  check(def,value,'',0);return {valid:issues.length===0,issues};
}
