module.exports=function(source){
  return "import {staticFile as paperStaticFile} from 'remotion';\n"+source.replace(/src="\/images\/([^\"]+)"/g,(_,name)=>`src={paperStaticFile('images/${name}')}`);
};
