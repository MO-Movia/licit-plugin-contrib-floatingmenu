# licit-plugin-contrib-floatingmenu
Licit plugin for managing an editor context menu


### Dependency

### Commands

- npm install

- npm run ci:build

- npm pack

#### To use this in Licit

Include plugin in licit component

```

import { FloatingMenuPlugin } from '@modusoperandi/licit-floatingmenu';


const  plugins = [new FloatingMenuPlugin(this.runtime)]

ReactDOM.render(<Licit docID={0} plugins={plugins}/>)

```